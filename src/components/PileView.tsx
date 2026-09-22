interface PileViewProps {
  kind: "deck" | "graveyard";
  count: number;
  topLabel?: string;
}

export function PileView({ kind, count, topLabel }: PileViewProps) {
  return (
    <div className={`pile pile--${kind}`}>
      <div className="pile__card">
        {kind === "graveyard" && topLabel && (
          <span className="pile__top-label">{topLabel}</span>
        )}
        <span className="pile__count">{count}</span>
      </div>
    </div>
  );
}
