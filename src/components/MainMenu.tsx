interface MainMenuProps {
  onPlay: () => void;
}

export function MainMenu({ onPlay }: MainMenuProps) {
  return (
    <div className="menu-screen">
      <div className="menu-screen__version">v0</div>
      <div className="menu-screen__hills" />

      <div className="menu-screen__content">
        <div className="menu-screen__emblem">
          <div className="menu-screen__ring menu-screen__ring--outer" />
          <div className="menu-screen__ring menu-screen__ring--inner" />

          <h1 className="menu-screen__title">Poly Cards</h1>
          <p className="menu-screen__tagline">Build a civilization, one Worker at a time.</p>

          <nav className="menu-screen__nav">
            <button className="menu-screen__item menu-screen__item--primary" onClick={onPlay}>
              Play
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
