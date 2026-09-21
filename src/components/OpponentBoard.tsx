import { definitionOf } from "../game/components/queries";
import type { PlayerState } from "../game/types";
import { CardView } from "./CardView";
import { HandFan } from "./HandFan";
import { PileView } from "./PileView";

interface OpponentBoardProps {
  opponent: PlayerState;
}

/**
 * The opponent's mirrored zones — deck, graveyard, lane, and a face-down
 * hand. Purely presentational: opponent doesn't take real turns yet (see
 * GameState.opponent), so nothing here is clickable and there's no game
 * logic — it only ever renders whatever GameBoard hands it.
 */
export function OpponentBoard({ opponent }: OpponentBoardProps) {
  const topGraveyardCard = opponent.graveyard[opponent.graveyard.length - 1];

  return (
    <div className="opponent-board">
      <div className="opponent-board__label">Opponent</div>

      <div className="opponent-board__hand">
        <HandFan cards={opponent.hand} faceDown />
      </div>

      <div className="opponent-board__playfield">
        <div className="side-piles">
          <PileView
            kind="graveyard"
            count={opponent.graveyard.length}
            topLabel={topGraveyardCard && definitionOf(topGraveyardCard).name}
          />
          <PileView kind="deck" count={opponent.deck.length} />
        </div>

        <div className="lane">
          {opponent.lane.map((card) => (
            <CardView key={card.instanceId} card={card} variant="lane" />
          ))}
        </div>
      </div>
    </div>
  );
}
