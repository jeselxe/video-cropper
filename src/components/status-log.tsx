import { useEffect, useRef } from "react";
import { LogEntry } from "../types";
import Icon from "./icon";

interface StatusLogProps {
  logs: LogEntry[];
}
const StatusLog: React.FC<StatusLogProps> = ({ logs }) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="log-panel">
      <div className="log-header">
        <Icon name="List" />
        <span>Process Log</span>
        <span className="log-count">({logs.length})</span>
      </div>
      <div className="log-content">
        {logs.map((entry) => (
          <div key={entry.id} className={`log-entry log-${entry.type}`}>
            <span className="log-timestamp">{entry.timestamp}</span>
            <span className="log-message">{entry.message}</span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};
export default StatusLog;
