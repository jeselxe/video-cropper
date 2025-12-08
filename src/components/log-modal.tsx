import { LogEntry } from "../types";
import Icon from "./icon";

interface LogModalProps {
  logs: LogEntry[];
  isOpen: boolean;
  onClose: () => void;
}

const LogModal: React.FC<LogModalProps> = ({ logs, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Process Logs</span>
          <button className="modal-close" onClick={onClose}>
            <Icon name="XCircle" />
          </button>
        </div>
        <div className="log-list">
          {logs.length === 0 && (
            <div style={{ color: "#666", textAlign: "center" }}>
              No logs yet
            </div>
          )}
          {logs.map((log, i) => (
            <div key={i} className={`log-item ${log.type}`}>
              <span className="log-time">{log.timestamp}</span>
              <span className="log-msg">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LogModal;
