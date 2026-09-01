import "./LazyPanel.css";

export default function LazyPanel() {
  return (
    <div className="lazy-panel-marker">
      This panel comes from a dynamic import. Its compatibility stylesheet must already be active in legacy mode.
    </div>
  );
}
