import { useState } from 'react';

interface CollabState {
  isConnected: boolean;
  roomId: string | null;
  peerCount: number;
  error: string | null;
  savedRooms: string[];
}

interface Props {
  state: CollabState;
  username: string;
  onUsernameChange: (name: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: (id: string) => void;
  onDisconnect: () => void;
  onDeleteRoom: (id: string) => void;
  onLoadRoom: (id: string) => string | null;
  onRehostRoom: (id: string) => void;
}

export default function CollabBar({ state, username, onUsernameChange, onCreateRoom, onJoinRoom, onDisconnect, onDeleteRoom, onLoadRoom, onRehostRoom }: Props) {
  const [joinId, setJoinId] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRooms, setShowRooms] = useState(false);

  const { isConnected, roomId, peerCount, savedRooms } = state;

  const nameInputClass = 'font-ui text-[12px] px-2.5 py-1 border border-border rounded-sm bg-paper text-ink outline-none w-[120px]';

  if (isConnected && roomId) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2 bg-toolbar-bg border-b border-border-light font-ui flex-wrap relative">
        <input
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          placeholder="Your name"
          className={nameInputClass}
          maxLength={20}
        />
        <span className="text-[13px] font-semibold text-accent">📡 Connected</span>
        <code className="text-[12px] px-2 py-0.5 bg-code-bg rounded-sm text-ink font-mono" title="Room ID">{roomId}</code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(roomId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className={`font-ui text-[11px] px-2 py-0.5 border rounded-sm cursor-pointer transition-all duration-150 ${copied ? 'bg-[#2d8a4e] text-white border-[#2d8a4e]' : 'bg-transparent text-ink-muted border-border hover:bg-toolbar-hover'}`}
        >
          {copied ? 'ID Copied!' : 'Copy ID'}
        </button>
        <span className="text-[12px] text-ink-muted">
          {peerCount} peer{peerCount !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onDisconnect}
          className="font-ui text-[12px] px-2.5 py-1 bg-transparent text-accent border border-accent rounded-sm cursor-pointer ml-1 hover:bg-accent/10"
        >
          Leave
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-4 py-2 bg-toolbar-bg border-b border-border-light font-ui flex-wrap relative">
      <input
        value={username}
        onChange={(e) => onUsernameChange(e.target.value)}
        placeholder="Your name"
        className={nameInputClass}
        maxLength={20}
      />
      <button
        onClick={onCreateRoom}
        className="font-ui text-[12px] font-semibold px-3.5 py-1 bg-accent text-white border-none rounded-sm cursor-pointer transition-all duration-150 hover:bg-accent-hover"
      >
        Create Room
      </button>
      {!showJoin ? (
        <button
          onClick={() => setShowJoin(true)}
          className="font-ui text-[12px] font-medium px-3.5 py-1 bg-transparent text-ink-light border border-border rounded-sm cursor-pointer transition-all duration-150 hover:bg-toolbar-hover"
        >
          Join Room
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="Room ID"
            className="font-ui text-[12px] px-2.5 py-1 border border-border rounded-sm bg-paper text-ink outline-none w-[160px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && joinId.trim()) {
                onJoinRoom(joinId.trim());
                setJoinId('');
                setShowJoin(false);
              }
            }}
          />
          <button
            onClick={() => {
              if (joinId.trim()) {
                onJoinRoom(joinId.trim());
                setJoinId('');
                setShowJoin(false);
              }
            }}
            className="font-ui text-[12px] font-semibold px-3 py-1 bg-ink text-paper border-none rounded-sm cursor-pointer"
          >
            Connect
          </button>
          <button
            onClick={() => { setShowJoin(false); setJoinId(''); }}
            className="font-ui text-[12px] px-2 py-1 bg-transparent text-ink-muted border border-border rounded-sm cursor-pointer hover:bg-toolbar-hover"
          >
            ✕
          </button>
        </div>
      )}
      {savedRooms.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowRooms(!showRooms)}
            className="font-ui text-[12px] font-medium px-2.5 py-1 bg-transparent text-ink-light border border-border rounded-sm cursor-pointer hover:bg-toolbar-hover"
          >
            Saved Rooms ({savedRooms.length})
          </button>
          {showRooms && (
            <div className="absolute top-full left-0 mt-1 bg-paper border border-border rounded-md shadow-[0_4px_16px_var(--color-paper-shadow)] min-w-[300px] z-[100] p-0">
              {savedRooms.map(room => {
                const doc = onLoadRoom(room);
                const preview = doc ? doc.slice(0, 40).replace(/\n/g, ' ') || 'Empty document' : 'Empty document';
                return (
                  <div key={room} className="flex items-center border-b border-border-light gap-1">
                    <button
                      onClick={() => { onJoinRoom(room); setShowRooms(false); }}
                      className="flex-1 flex flex-col items-start px-3 py-2 bg-transparent border-none cursor-pointer text-ink w-full text-left hover:bg-toolbar-hover"
                    >
                      <span className="font-mono text-[12px] font-semibold text-accent">{room}</span>
                      <span className="font-body text-[11px] text-ink-muted overflow-hidden text-ellipsis whitespace-nowrap max-w-[220px]">{preview}</span>
                    </button>
                    <button
                      onClick={() => { onRehostRoom(room); setShowRooms(false); }}
                      className="flex items-center gap-0.5 px-2.5 py-1.5 bg-code-bg border border-border rounded-sm cursor-pointer text-accent text-[11px] font-semibold font-ui transition-all duration-150 hover:bg-accent hover:text-white hover:border-accent"
                      title="Create a new room with this document's content"
                    >
                      <span className="text-[12px] leading-none">↻</span>
                      <span className="text-[11px] tracking-tight">Re-host</span>
                    </button>
                    <button
                      onClick={() => onDeleteRoom(room)}
                      className="px-2.5 py-2 bg-transparent border-none cursor-pointer text-ink-muted text-[11px] hover:text-accent"
                      title="Delete room"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {state.error && <span className="text-[11px] text-accent">Error: {state.error}</span>}
    </div>
  );
}
