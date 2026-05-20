import { useEffect, useMemo, useRef, useState } from 'react';
import { useVoiceRecorder } from '../../../hooks/user/coaching/useVoiceRecorder';
import { coachingService } from '../../../api/user/coachingService';
import CoachingModeSelector from './CoachingModeSelector';
import VoiceMessageBubble from './VoiceMessageBubble';

function createTextMessage(role, speaker, text, extra = {}) {
  return {
    id: `${role}-${Date.now()}-${Math.random()}`,
    type: 'text',
    role,
    speaker,
    text,
    ...extra,
  };
}

function createVoiceMessage({ role = 'ai', speaker, text, audioUrl, coachingScriptTurnId, turnOrder }) {
  return {
    id: `voice-${coachingScriptTurnId ?? Date.now()}-${Math.random()}`,
    type: 'voice',
    role,
    speaker,
    text,
    audioUrl,
    coachingScriptTurnId,
    turnOrder,
  };
}

function normalizePreviousMessages(messages = []) {
  return messages
    .map((message) => {
      const rawRole = String(message.role ?? '').toUpperCase();
      const speaker = String(message.speaker ?? '').toLowerCase();

      let role = 'USER';

      if (
        rawRole === 'ASSISTANT' ||
        rawRole === 'AI' ||
        rawRole === 'STAFF' ||
        speaker.includes('staff') ||
        speaker.includes('coach') ||
        speaker.includes('ai')
      ) {
        role = 'ASSISTANT';
      }

      return {
        role,
        message: message.message ?? message.text ?? '',
      };
    })
    .filter((message) => message.message);
}

function summarizeResponseShape(label, response) {
  if (response === null) return `${label}=null`;
  if (response === undefined) return `${label}=undefined`;

  const data = response?.data;
  const keys = typeof response === 'object' ? Object.keys(response).slice(0, 8) : [];
  const dataKeys = data && typeof data === 'object' ? Object.keys(data).slice(0, 8) : [];
  const coachingSessionId = response?.coachingSessionId ?? data?.coachingSessionId ?? null;
  const turns = response?.turns ?? data?.turns ?? null;
  const turnsLength = Array.isArray(turns) ? turns.length : null;

  return `${label} keys=[${keys.join(',')}] dataKeys=[${dataKeys.join(',')}] coachingSessionId=${coachingSessionId ?? 'none'} turns=${turnsLength ?? 'none'}`;
}

function getActiveQuickReplies(quickReplies, phase) {
  if (!quickReplies?.length) return [];

  return quickReplies.filter((reply) => {
    if (reply.modeId) {
      return phase === 'intro';
    }

    if (reply.id === 'start_practice') {
      return phase === 'scenario';
    }

    return true;
  });
}

function CoachingChatSection({
  summary,
  modes = [],
  phase,
  selectedModeId,
  onSelectMode,
  onPhaseChange,
  onEvaluationReady,
  onRetry,
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [coachingSessionId, setCoachingSessionId] = useState(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptTurns, setScriptTurns] = useState([]);

  const chatLogRef = useRef(null);

  const safeSummary = summary ?? {};
  const safeMapArea = safeSummary.mapArea ?? {};
  const safePreviousEvaluation = safeSummary.previousEvaluation ?? {};

  const learnerName = safeSummary.name ?? safeSummary.userName ?? '학습자';
  const placeName = safeSummary.placeName ?? safeMapArea.title ?? '방금 학습한 장소';
  const learningSessionId = safeSummary.sessionId ?? safeSummary.learningSessionId ?? null;

  const modeReplies = useMemo(
    () => modes.map((mode) => ({ id: mode.id, label: mode.label, modeId: mode.id })),
    [modes],
  );

  const initialMessage = useMemo(
    () =>
      createTextMessage(
        'ai',
        'AI Coach',
        `${learnerName}님, 방금 ${placeName} 다녀오셨군요!
이제 막 연습한 표현들이 아직 머리에 남아있을 때,
AI Coach랑 조금 더 재밌게 이어서 대화해봐요~ 히히

이번에는
조금 더 어려운 단어나 표현에 도전해볼 수도 있고,
진짜 외국에서 대화하는 느낌으로 길게 이야기해볼 수도 있어요 👀

어떤 느낌으로 연습해보고 싶으세요?
말씀만 해주시면 AI Coach 바로 달려갑니다!!!야르!!!`,
        { quickReplies: modeReplies },
      ),
    [learnerName, modeReplies, placeName],
  );

  useEffect(() => {
    if (phase === 'intro') {
      setMessages([initialMessage]);
      setInput('');
      setIsBusy(false);
      setErrorMessage('');
      setCoachingSessionId(null);
      setScriptReady(false);
      setScriptTurns([]);
    }
  }, [initialMessage, phase]);

  useEffect(() => {
    const log = chatLogRef.current;

    if (!log) return;

    log.scrollTop = log.scrollHeight;
  }, [messages]);

  const appendMessages = (nextMessages) => {
    setMessages((current) => [...current, ...nextMessages]);
  };

  const buildPracticeStartMessage = async (nextCoachingSessionId) => {
    const conversationStart = await coachingService.startConversation(nextCoachingSessionId);

    setScriptReady(true);
    onPhaseChange('practice');

    appendMessages([
      createTextMessage('user', learnerName, '오케이, 시작할게요.'),
      createVoiceMessage({
        role: 'ai',
        speaker: 'AI Coach',
        text: conversationStart.assistantText,
        audioUrl: conversationStart.assistantAudioUrl,
        coachingScriptTurnId: conversationStart.coachingScriptTurnId,
        turnOrder: conversationStart.turnOrder,
      }),
    ]);
  };

  const handleSelectMode = async (modeId) => {
    const optionType = modeId?.replace('mode_', '');
    const mode = modes.find((item) => item.id === optionType);

    if (phase !== 'intro' || coachingSessionId || scriptTurns.length) {
      setErrorMessage('이미 코칭 옵션이 선택되었어요. 현재 코칭을 먼저 진행해주세요.');
      return;
    }

    if (!learningSessionId) {
      setErrorMessage('학습 세션 정보를 아직 찾지 못했어요. 지도 학습 완료 후 다시 시도해주세요.');
      return;
    }

    try {
      setIsBusy(true);
      setErrorMessage('');

      const flowResponse = await coachingService.startCoachingFlow({
        sessionId: learningSessionId,
        optionType,
      });

      const previousMessages = (
        safeSummary.sessionMessages?.length
          ? normalizePreviousMessages(safeSummary.sessionMessages)
          : normalizePreviousMessages(safeMapArea.conversationLog)
      ).slice(-4);

      const scriptResponse = await coachingService.prepareCoachingScript({
        sessionId: learningSessionId,
        optionType,
        placeName: safeSummary.placeName ?? safeMapArea.title ?? '',
        country: safeSummary.country ?? '',
        city: safeSummary.city ?? '',
        placeAddress: safeSummary.placeAddress ?? safeMapArea.address ?? '',
        evaluation:
          typeof safeSummary.evaluation === 'string'
            ? safeSummary.evaluation
            : safePreviousEvaluation.content ?? '',
        previousMessages,
      });

      console.error('[COACHING_DEBUG]', 'start flow response shape', flowResponse);
      console.error('[COACHING_DEBUG]', 'prepare script response shape', scriptResponse);

      const targetCoachingSessionId =
        scriptResponse?.coachingSessionId ??
        scriptResponse?.data?.coachingSessionId ??
        flowResponse?.coachingSessionId ??
        flowResponse?.data?.coachingSessionId;
      const preparedTurns = scriptResponse?.turns ?? scriptResponse?.data?.turns ?? [];
      const initialMessage = flowResponse?.initialMessage ?? flowResponse?.data?.initialMessage;
      const responseShapeSummary = [
        summarizeResponseShape('flow', flowResponse),
        summarizeResponseShape('script', scriptResponse),
      ].join(' | ');

      if (!targetCoachingSessionId) {
        throw new Error(`코칭 세션 정보를 받지 못했어요. 잠시 후 다시 시도해주세요. (${responseShapeSummary})`);
      }

      if (!preparedTurns.length) {
        throw new Error(`코칭 스크립트를 준비하지 못했어요. 잠시 후 다시 시도해주세요. (${responseShapeSummary})`);
      }

      setCoachingSessionId(targetCoachingSessionId);
      setScriptTurns(preparedTurns);
      onSelectMode(optionType);
      onPhaseChange('scenario');

      appendMessages([
        createTextMessage('user', learnerName, `${mode?.label ?? optionType}로 연습할래요.`),
        createTextMessage(
          'ai',
          'AI Coach',
          `${initialMessage?.message ?? '좋아요. 지금부터 AI 코칭을 시작해볼게요.'}

이번 코칭 대화는 총 ${preparedTurns.length}턴으로 준비했어요.

${preparedTurns
  .map((turn) => `TURN ${turn.turnOrder}
AI: ${turn.assistantText}
You: ${turn.expectedText}`)
  .join('\n\n')}`,
          {
            quickReplies: [{ id: 'start_practice', label: '오케이, 시작하기' }],
          },
        ),
      ]);
    } catch (error) {
      setErrorMessage(error.message || '옵션 선택 중 오류가 발생했어요.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleStartPractice = async () => {
    if (!coachingSessionId || !selectedModeId || !scriptTurns.length) {
      setErrorMessage('코칭 스크립트 준비가 아직 완료되지 않았어요.');
      return;
    }

    try {
      setIsBusy(true);
      setErrorMessage('');
      await buildPracticeStartMessage(coachingSessionId);
    } catch (error) {
      setErrorMessage(error.message || '대화 시작 준비 중 오류가 발생했어요.');
    } finally {
      setIsBusy(false);
    }
  };

  const finalizeConversation = async () => {
    if (!coachingSessionId) return;

    const finalResult = await coachingService.finishConversation(coachingSessionId);
    const feedback = finalResult.feedback;

    appendMessages([
      createTextMessage(
        'ai',
        'AI Coach',
        `오늘 연습이 끝났습니다. 종합 점수는 ${feedback?.totalScore ?? '-'}점이에요. ${feedback?.summaryFeedback ?? ''}`,
      ),
    ]);

    onEvaluationReady(finalResult);
  };

  const handleRecordedAudio = async (audioBlob) => {
    if (!coachingSessionId) {
      setErrorMessage('코칭 세션이 준비되지 않았어요.');
      return;
    }

    try {
      setIsBusy(true);
      setErrorMessage('');

      const audioFile = new File([audioBlob], `coaching-${Date.now()}.webm`, {
        type: audioBlob.type || 'audio/webm',
      });

      const turnResponse = await coachingService.processUserSpeech(coachingSessionId, audioFile);
      const userAudioUrl = URL.createObjectURL(audioBlob);

      const nextMessages = [
        createVoiceMessage({
          role: 'user',
          speaker: learnerName,
          text: turnResponse.recognizedText || '음성 인식 결과가 비어 있어요.',
          audioUrl: userAudioUrl,
          coachingScriptTurnId: turnResponse.coachingScriptTurnId,
          turnOrder: turnResponse.turnOrder,
        }),
      ];

      if (turnResponse.userFeedback) {
        nextMessages.push(createTextMessage('ai', 'AI Coach', `발음 체크: ${turnResponse.userFeedback}`));
      }

      if (!turnResponse.conversationEnded && turnResponse.nextAssistantText) {
        nextMessages.push(
          createVoiceMessage({
            role: 'ai',
            speaker: 'AI Coach',
            text: turnResponse.nextAssistantText,
            audioUrl: turnResponse.nextAssistantAudioUrl,
            coachingScriptTurnId: turnResponse.nextScriptTurnId,
            turnOrder: turnResponse.nextTurnOrder,
          }),
        );
      }

      appendMessages(nextMessages);

      if (turnResponse.conversationEnded) {
        await finalizeConversation();
      }
    } catch (error) {
      setErrorMessage(error.message || '음성 처리 중 오류가 발생했어요.');
    } finally {
      setIsBusy(false);
    }
  };

  const {
    isRecording,
    audioInputDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    isVirtualMicrophoneSelected,
    toggleRecording,
  } = useVoiceRecorder({
    onRecorded: handleRecordedAudio,
    onError: setErrorMessage,
  });

  const handleMicClick = async () => {
    if (isBusy) return;

    if (phase !== 'practice' || !scriptReady) {
      setErrorMessage('먼저 옵션을 선택하고 대화를 시작해주세요.');
      return;
    }

    setErrorMessage('');
    await toggleRecording();
  };

  const handleSendMessage = (text = input) => {
    const trimmed = text.trim();

    if (!trimmed) return;

    setInput('');
    appendMessages([createTextMessage('user', learnerName, trimmed)]);
    appendMessages([
      createTextMessage(
        'ai',
        'AI Coach',
        '현재 심화 대화는 음성 기반으로 진행돼요. 마이크 버튼으로 이어서 말해보세요.',
      ),
    ]);
  };

  const handleQuickReply = async (reply) => {
    if (reply.modeId) {
      await handleSelectMode(reply.modeId);
      return;
    }

    if (reply.id === 'start_practice') {
      await handleStartPractice();
      return;
    }

    if (reply.id === 'retry') {
      onRetry();
      return;
    }

    if (reply.id === 'go_map') {
      window.location.href = '/map';
    }
  };

  const statusLabel =
    {
      intro: '대기 중',
      scenario: isBusy ? '연결 중' : '준비 완료',
      practice: isBusy ? '음성 처리 중' : '음성 대화',
      completed: '평가 완료',
    }[phase] ?? '대기 중';

  return (
    <section className="coaching-chat-panel" aria-labelledby="coaching-chat-title">
      <header className="coaching-chat-header">
        <div className="coaching-chat-title">
          <span className="coaching-live-dot" aria-hidden="true" />
          <div>
            <p>AI Coach</p>
            <h1 id="coaching-chat-title">심화 코칭 채팅</h1>
          </div>
        </div>
        <span className={`coaching-status-pill is-${phase}`}>{statusLabel}</span>
      </header>

      <div className="coaching-chat-log" ref={chatLogRef}>
        <div className="coaching-chat-mascot" aria-hidden="true">
          <span className="mascot-antenna" />
          <span className="mascot-face">
            <i />
            <i />
          </span>
          <span className="mascot-body" />
        </div>

        {messages.map((message) =>
          message.type === 'voice' ? (
            <VoiceMessageBubble key={message.id} message={message} />
          ) : (
            <article key={message.id} className={`coaching-message-row is-${message.role}`}>
              {message.role === 'ai' && <div className="coaching-avatar">AI</div>}
              <div className="coaching-text-bubble">
                <span>{message.speaker}</span>
                <p>{message.text}</p>

                {getActiveQuickReplies(message.quickReplies, phase).length ? (
                  <CoachingModeSelector
                    modes={getActiveQuickReplies(message.quickReplies, phase).map((reply) => ({
                      id: reply.id,
                      label: reply.label,
                      modeId: reply.modeId,
                    }))}
                    selectedModeId=""
                    disabled={isBusy}
                    onSelect={(replyId) => {
                      if (isBusy) return;

                      const reply = message.quickReplies.find((item) => item.id === replyId);
                      handleQuickReply(reply);
                    }}
                  />
                ) : null}
              </div>
            </article>
          ),
        )}

        {errorMessage ? (
          <article className="coaching-message-row is-ai">
            <div className="coaching-avatar">AI</div>
            <div className="coaching-text-bubble">
              <span>안내</span>
              <p>{errorMessage}</p>
            </div>
          </article>
        ) : null}
      </div>

      <form
        className="coaching-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          handleSendMessage();
        }}
      >
        <div className="coaching-mic-device-row">
          <label htmlFor="coaching-mic-device">마이크</label>
          <select
            id="coaching-mic-device"
            value={selectedDeviceId}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
            disabled={isRecording || isBusy || !audioInputDevices.length}
          >
            {audioInputDevices.length ? (
              audioInputDevices.map((device, index) => (
                <option key={device.deviceId || index} value={device.deviceId}>
                  {device.label || `마이크 ${index + 1}`}
                </option>
              ))
            ) : (
              <option value="">마이크 권한 확인 필요</option>
            )}
          </select>
        </div>

        {isVirtualMicrophoneSelected ? (
          <p className="coaching-mic-device-warning">
            현재 가상 마이크가 선택되어 있어 음성이 인식되지 않을 수 있습니다. MacBook 마이크를 선택해주세요.
          </p>
        ) : null}

        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            isRecording
              ? '녹음 중이에요... 다시 누르면 전송됩니다.'
              : phase === 'practice'
                ? '텍스트 입력 대신 마이크 버튼으로 말해보세요.'
                : '메시지를 입력하세요...'
          }
        />
        <button
          type="button"
          className={`coaching-mic-button ${isRecording ? 'is-recording' : ''}`}
          onClick={handleMicClick}
          aria-label={isRecording ? '음성 로그 종료' : '음성 로그 시작'}
          disabled={isBusy}
        >
          <span className="coaching-mic-icon" aria-hidden="true" />
        </button>
        <button type="submit" className="coaching-send-button" aria-label="메시지 전송" disabled={isBusy}>
          ▶
        </button>
      </form>
    </section>
  );
}

export default CoachingChatSection;
