import Icon from "./icon";

interface ConcatToolProps {
  files: string[];
  isProcessing: boolean;
  onAddFiles: () => void;
  onMoveFile: (index: number, direction: -1 | 1) => void;
  onRemoveFile: (index: number) => void;
  onExport: () => void;
}

const ConcatTool: React.FC<ConcatToolProps> = ({
  files,
  isProcessing,
  onAddFiles,
  onMoveFile,
  onRemoveFile,
  onExport,
}) => {
  return (
    <div className="concat-layout">
      <div className="editor-panel">
        <div className="toolbar">
          <div>
            <div className="app-title">
              <Icon name="List" />
              <span>Concat Clips</span>
            </div>
            <div className="concat-subtitle">
              Combine sequential GoPro clips without re-encoding.
            </div>
          </div>
          <button className="btn btn-secondary" onClick={onAddFiles}>
            <Icon name="Upload" /> Add Videos
          </button>
        </div>

        {files.length > 0 ? (
          <div className="concat-list">
            {files.map((file, index) => (
              <div key={`${file}-${index}`} className="concat-item">
                <div className="concat-item-main">
                  <div className="concat-item-index">{index + 1}</div>
                  <div className="concat-item-copy">
                    <div className="concat-item-name">
                      {file.split(/[/\\]/).pop()}
                    </div>
                    <div className="concat-item-path">{file}</div>
                  </div>
                </div>

                <div className="concat-item-actions">
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => onMoveFile(index, -1)}
                    disabled={index === 0 || isProcessing}
                  >
                    Up
                  </button>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => onMoveFile(index, 1)}
                    disabled={index === files.length - 1 || isProcessing}
                  >
                    Down
                  </button>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => onRemoveFile(index)}
                    disabled={isProcessing}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="concat-empty">
            <Icon name="Video" />
            <span>No videos selected</span>
            <span className="concat-empty-note">
              Add at least two clips from the same GoPro recording setup.
            </span>
          </div>
        )}
      </div>

      <div className="editor-panel">
        <div className="toolbar">
          <div className="control-group">
            <div className="data-display">
              <span className="data-label">Clips</span>
              <span className="data-value">{files.length}</span>
            </div>
          </div>

          <button
            className="btn btn-success"
            onClick={onExport}
            disabled={isProcessing || files.length < 2}
          >
            {isProcessing ? <Icon name="Loader" /> : <Icon name="Download" />}
            {isProcessing ? "Concatenating..." : "Concat"}
          </button>
        </div>

        <div className="concat-help">
          This uses FFmpeg concat demuxer with stream copy. All files should come
          from the same camera and recording mode.
        </div>
      </div>
    </div>
  );
};

export default ConcatTool;
