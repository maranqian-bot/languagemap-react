function CoachingModeSelector({ modes, selectedModeId, onSelect, disabled = false }) {
  const icons = {
    WORD: '▣',
    GRAMMAR: '✎',
    DIALOGUE: '▤',
    mode_WORD: '▣',
    mode_GRAMMAR: '✎',
    mode_DIALOGUE: '▤',
    start_practice: '▶',
    show_evaluation: '✓',
    retry: '↻',
    go_map: '⌂',
  };

  return (
    <div className="coaching-mode-selector" aria-label="빠른 답장">
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={`coaching-mode-button ${selectedModeId === mode.id ? 'is-selected' : ''}`}
          disabled={disabled}
          onClick={() => onSelect(mode.id)}
        >
          <span aria-hidden="true">{icons[mode.modeId ?? mode.id] ?? '•'}</span>
          {mode.label}
        </button>
      ))}
    </div>
  );
}

export default CoachingModeSelector;
