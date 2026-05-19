import { useRef, useState } from 'react';

const FASTAPI_BASE_URL = import.meta.env.VITE_FASTAPI_BASE_URL;

function resolveAudioUrl(audioUrl) {
  if (!audioUrl) return '';

  if (audioUrl.startsWith('http')) {
    return audioUrl;
  }

  if (audioUrl.startsWith('/static')) {
    return `${FASTAPI_BASE_URL}${audioUrl}`;
  }

  return audioUrl;
}

function VoiceMessageBubble({ message }) {
  const [playStatus, setPlayStatus] = useState('idle');
  const audioRef = useRef(null);

  const isUser = message.role === 'user';
  const resolvedAudioUrl = resolveAudioUrl(message.audioUrl);

  const handlePlay = async () => {
    if (!resolvedAudioUrl) return;

    try {
      if (audioRef.current && playStatus === 'playing') {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setPlayStatus('idle');
        return;
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }

      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = resolvedAudioUrl;
      audioRef.current = audio;

      setPlayStatus('loading');

      audio.onplay = () => setPlayStatus('playing');

      audio.onended = () => {
        audio.currentTime = 0;
        setPlayStatus('ended');
      };

      audio.onerror = (error) => {
        console.error('Audio playback error:', error);
        console.error('audioUrl:', message.audioUrl);
        console.error('resolvedAudioUrl:', resolvedAudioUrl);
        setPlayStatus('error');
      };

      audio.load();

      await new Promise((resolve, reject) => {
        audio.oncanplaythrough = resolve;
        audio.onerror = reject;
      });

      await audio.play();
    } catch (error) {
      console.error('Audio play failed:', error);
      console.error('audioUrl:', message.audioUrl);
      console.error('resolvedAudioUrl:', resolvedAudioUrl);
      setPlayStatus('error');
    }
  };

  const playLabel = {
    idle: '▶',
    loading: '…',
    playing: '■',
    ended: '↻',
    error: '!',
  }[playStatus];

  return (
    <article className={`coaching-message-row ${isUser ? 'is-user' : 'is-ai'}`}>
      {!isUser && <div className="coaching-avatar">AI</div>}

      <div
        className={`voice-message-bubble ${isUser ? 'is-user' : 'is-ai'} ${
          playStatus === 'playing' ? 'is-playing' : ''
        }`}
      >
        <div className="voice-message-meta">
          <span>{message.speaker}</span>
          <small>{message.turnOrder ? `TURN ${message.turnOrder}` : message.duration ?? 'VOICE'}</small>
        </div>

        <div className="voice-message-body">
          <button
            type="button"
            className={`voice-play-button ${playStatus === 'playing' ? 'is-playing' : ''}`}
            aria-label={`${message.speaker} 음성 재생`}
            onClick={handlePlay}
            disabled={playStatus === 'loading'}
          >
            {playLabel}
          </button>

          <div className="voice-wave" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>

        <p>{message.text}</p>

        {playStatus === 'error' ? (
          <small className="voice-error-text">음성 파일을 재생할 수 없습니다.</small>
        ) : null}
      </div>
    </article>
  );
}

export default VoiceMessageBubble;
