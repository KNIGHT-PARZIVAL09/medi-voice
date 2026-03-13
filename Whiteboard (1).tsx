import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Line } from 'react-konva';

interface WhiteboardProps {
  roomId: string;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({ roomId }) => {
  const [lines, setLines] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const isDrawing = useRef(false);
  const linesRef = useRef<any[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  // Sync ref with state for saving
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    let isMounted = true;
    
    // Load initial data for this specific room
    const loadData = async () => {
      try {
        const res = await fetch('/api/appointments');
        const apps = await res.json();
        const app = apps.find((a: any) => a.id === roomId);
        if (isMounted) {
          if (app?.whiteboardData) {
            const loadedLines = JSON.parse(app.whiteboardData);
            setLines(loadedLines);
            linesRef.current = loadedLines;
          } else {
            setLines([]);
            linesRef.current = [];
          }
        }
      } catch (err) {
        console.error('Failed to load whiteboard data:', err);
      }
    };

    loadData();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}?roomId=${roomId}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'draw') {
        setLines((prev) => {
          const newLines = [...prev, data.line];
          linesRef.current = newLines;
          return newLines;
        });
      } else if (data.type === 'clear') {
        setLines([]);
        linesRef.current = [];
      }
    };

    return () => {
      isMounted = false;
      socket.close();
    };
  }, [roomId]);

  const handleMouseDown = (e: any) => {
    isDrawing.current = true;
    const pos = e.target.getStage().getPointerPosition();
    const newLine = { tool: 'pen', points: [pos.x, pos.y] };
    setLines(prev => {
      const newLines = [...prev, newLine];
      linesRef.current = newLines;
      return newLines;
    });
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing.current) return;

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    
    setLines(prev => {
      if (prev.length === 0) return prev;
      const lastLine = { ...prev[prev.length - 1] };
      lastLine.points = [...lastLine.points, point.x, point.y];
      const newLines = [...prev.slice(0, -1), lastLine];
      linesRef.current = newLines;
      return newLines;
    });
  };

  const saveWhiteboard = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/appointments/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whiteboardData: JSON.stringify(linesRef.current) })
      });
      if (!response.ok) throw new Error('Failed to save');
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    // Send the completed line to others
    if (socketRef.current?.readyState === WebSocket.OPEN && linesRef.current.length > 0) {
      socketRef.current.send(JSON.stringify({
        type: 'draw',
        line: linesRef.current[linesRef.current.length - 1]
      }));
    }

    saveWhiteboard();
  };

  const clearCanvas = async () => {
    setLines([]);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'clear' }));
    }

    // Save to server
    setIsSaving(true);
    try {
      await fetch(`/api/appointments/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whiteboardData: JSON.stringify([]) })
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-inner overflow-hidden border border-slate-200">
      <div className="p-2 border-bottom flex justify-between items-center bg-slate-50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Digital Whiteboard</span>
          {isSaving && (
            <span className="text-[10px] text-emerald-500 font-medium animate-pulse flex items-center gap-1">
              <div className="w-1 h-1 bg-emerald-500 rounded-full" />
              Saving...
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button 
            onClick={saveWhiteboard}
            disabled={isSaving}
            className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            Save
          </button>
          <button 
            onClick={clearCanvas}
            className="text-xs px-2 py-1 bg-white border border-slate-200 rounded hover:bg-slate-100 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      <Stage
        width={600}
        height={400}
        onMouseDown={handleMouseDown}
        onMousemove={handleMouseMove}
        onMouseup={handleMouseUp}
        className="cursor-crosshair"
      >
        <Layer>
          {lines.map((line, i) => (
            <Line
              key={i}
              points={line.points}
              stroke="#1e293b"
              strokeWidth={3}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation={
                line.tool === 'eraser' ? 'destination-out' : 'source-over'
              }
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
};
