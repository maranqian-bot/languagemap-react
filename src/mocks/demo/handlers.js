// 백엔드 없이 AI 코칭 기능을 시연하기 위한 MSW 핸들러.
//
// 응답 형태는 languagemap-spring 의 DTO 를 그대로 따른다.
//   - CoachingEntryDto.ResponseGetCoachingEntry
//   - StartCoachingSessionDto.ResponseStartCoachingSession
//   - CoachingScriptTurnDto.ResponseCoachingScriptTurn
//   - CoachingPronunciationResultDto / CoachingFeedbackDto
//
// 실제 서버는 { success, message, data } 봉투를 쓰고 프론트가 data 를 벗겨낸다
// (coachingService.unwrapCoachingResponse 참고).
import { http, HttpResponse } from 'msw';

const ok = (data, message = '요청이 처리되었습니다.') =>
  HttpResponse.json({ success: true, message, data });

// ---------------------------------------------------------------- 고정 데이터
const DEMO_USER = {
  userId: 1,
  email: 'demo@mapingo.dev',
  name: '데모유저',
  role: 'USER',
  status: 'ACTIVE',
};

// 지도 학습(카페에서 주문하기)을 이미 끝낸 상태에서 AI 코칭에 진입하는 시나리오.
const DEMO_ENTRY = {
  sessionId: 1,
  placeId: 1,
  placeName: 'Cafe Stage 888',
  country: 'Australia',
  city: 'Sydney',
  placeAddress: 'Near George St.',
  latitude: -33.8688,
  longitude: 151.2093,
  evaluation: '발음 보통, 표현 좋음, 속도 개선 필요',
  sessionMessages: [
    { messageId: 1, role: 'ASSISTANT', message: 'Good morning! What can I get for you today?', createdAt: '2026-04-26 16:20:12' },
    { messageId: 2, role: 'USER', message: 'I would like a latte with almond milk, please.', createdAt: '2026-04-26 16:20:31' },
    { messageId: 3, role: 'ASSISTANT', message: 'Sure. Would you like it hot or iced?', createdAt: '2026-04-26 16:20:48' },
    { messageId: 4, role: 'USER', message: 'Iced, preferably with less ice.', createdAt: '2026-04-26 16:21:05' },
  ],
};

// 선택한 옵션(WORD / GRAMMAR / DIALOGUE)에 따라 다른 스크립트를 돌려준다.
// 사용자가 옵션을 바꿔 가며 눌러 봐도 결과가 달라지도록.
// 각 턴은 자기 문장에 대한 발음 평가 결과를 함께 들고 있다.
// (평가 문구와 문제 단어가 실제 문장과 어긋나면 데모에서 바로 티가 난다)
// 점수는 턴이 진행될수록 조금씩 오르게 두어 학습 흐름이 드러나도록 했다.
const SCRIPTS = {
  WORD: [
    { assistantText: 'Welcome back! Today let us use a few richer words. How would you describe the aroma of your coffee?',
      expectedText: 'The aroma is rich and slightly nutty.',
      accuracyScore: 88.0, fluencyScore: 79.0, completenessScore: 100.0, pronunciationScore: 85.4,
      userFeedback: 'aroma 의 첫 모음을 조금 더 길게 발음하면 좋습니다.', problemWords: ['aroma'] },
    { assistantText: 'Nice. Now, could you order a drink using the word "preferably"?',
      expectedText: 'I would like an iced latte, preferably with almond milk.',
      accuracyScore: 93.0, fluencyScore: 86.0, completenessScore: 100.0, pronunciationScore: 90.7,
      userFeedback: 'almond 의 l 은 묵음입니다. "아-먼드"에 가깝게 발음해 보세요.', problemWords: ['almond', 'preferably'] },
    { assistantText: 'Great choice of words. One more — describe the texture of the foam.',
      expectedText: 'The foam is velvety and smooth.',
      accuracyScore: 96.0, fluencyScore: 91.0, completenessScore: 100.0, pronunciationScore: 94.2,
      userFeedback: '아주 자연스러웠습니다. 문장 끝 억양도 안정적입니다.', problemWords: [] },
  ],
  GRAMMAR: [
    { assistantText: 'Let us practise polite requests. Ask me for a latte using "Could you".',
      expectedText: 'Could you make me a latte with almond milk?',
      accuracyScore: 87.0, fluencyScore: 80.0, completenessScore: 100.0, pronunciationScore: 85.1,
      userFeedback: 'Could you 를 한 덩어리로 붙여 읽으면 더 자연스럽습니다.', problemWords: ['almond'] },
    { assistantText: 'Good. Now use a conditional — what would you order if they had no almond milk?',
      expectedText: 'If they had no almond milk, I would order oat milk instead.',
      accuracyScore: 91.0, fluencyScore: 84.0, completenessScore: 100.0, pronunciationScore: 89.3,
      userFeedback: 'oat 의 모음이 짧게 끊깁니다. "오우트"에 가깝게 늘려 보세요.', problemWords: ['oat'] },
    { assistantText: 'Excellent. Finally, tell me what you had ordered before you arrived here.',
      expectedText: 'I had ordered an iced americano before I arrived.',
      accuracyScore: 95.0, fluencyScore: 90.0, completenessScore: 100.0, pronunciationScore: 93.6,
      userFeedback: '과거완료 문장을 끊김 없이 잘 이어갔습니다.', problemWords: [] },
  ],
  DIALOGUE: [
    { assistantText: 'Good morning. What would you like to order today?',
      expectedText: 'I would like a latte with almond milk, please.',
      accuracyScore: 88.0, fluencyScore: 79.0, completenessScore: 100.0, pronunciationScore: 85.4,
      userFeedback: 'almond 의 l 은 묵음입니다. "아-먼드"에 가깝게 발음해 보세요.', problemWords: ['almond'] },
    { assistantText: 'Of course. Hot or iced?',
      expectedText: 'Iced, preferably with less ice.',
      accuracyScore: 93.0, fluencyScore: 86.0, completenessScore: 100.0, pronunciationScore: 90.7,
      userFeedback: 'preferably 는 4음절입니다. "프리퍼러블리"로 또박또박 연습해 보세요.', problemWords: ['preferably'] },
    { assistantText: 'Anything else for you today?',
      expectedText: 'That is all, thank you. How much is it?',
      accuracyScore: 96.0, fluencyScore: 91.0, completenessScore: 100.0, pronunciationScore: 94.2,
      userFeedback: '아주 자연스러웠습니다. 문장 끝 억양도 안정적입니다.', problemWords: [] },
  ],
};

const FINAL_FEEDBACK = {
  coachingSessionId: 1,
  totalScore: 90,
  summaryFeedback:
    '전반적으로 자연스럽게 대화를 이어갔습니다. 어휘 선택이 상황에 잘 맞았고, 문장 끝 억양도 안정적이었습니다. almond, preferably 두 단어의 발음만 조금 더 다듬으면 원어민이 듣기에도 매우 매끄러운 주문 대화가 됩니다.',
  naturalnessLevel: 'GOOD',
  naturalnessComment: '문장이 끊기지 않고 자연스럽게 이어졌습니다.',
  naturalnessScore: 88,
  flowLevel: 'GOOD',
  flowComment: '상대의 질문 의도에 맞게 적절히 답변했습니다.',
  flowScore: 92,
  pronunciationLevel: 'CHECK',
  pronunciationComment: 'almond, preferably 발음을 더 연습하면 좋습니다.',
  pronunciationScore: 90,
  problemWords: ['almond', 'preferably'],
};

// YouTube 추천 — youtube_service.py 가 대화 주제에서 키워드를 뽑아 추천하는 기능.
// 데모에서는 실제로 존재하는 카페 영어 회화 영상을 고정으로 돌려준다.
const YOUTUBE_PICKS = [
  {
    videoTitle: 'English Conversation at a Café (Coffee Shop) | Useful Phrases',
    channelTitle: 'English Panda',
    videoUrl: 'https://www.youtube.com/watch?v=2VeQTuSSiI0',
    thumbnailUrl: 'https://i.ytimg.com/vi/2VeQTuSSiI0/mqdefault.jpg',
    videoSummary: '카페에서 주문할 때 쓰는 표현을 상황별로 정리한 영상입니다. 오늘 연습한 주문 대화를 복습하기 좋습니다.',
  },
  {
    videoTitle: 'Ordering Coffee & Food in English – Easy Conversation Practice at a Cafe!',
    channelTitle: 'Speak Smart English',
    videoUrl: 'https://www.youtube.com/watch?v=bBajqbE82Ys',
    thumbnailUrl: 'https://i.ytimg.com/vi/bBajqbE82Ys/mqdefault.jpg',
    videoSummary: '음료와 간단한 음식을 주문하는 대화를 천천히 따라 할 수 있게 구성했습니다.',
  },
  {
    videoTitle: 'How to Order Coffee in English - Spoken English Lesson',
    channelTitle: 'Oxford Online English',
    videoUrl: 'https://www.youtube.com/watch?v=SLC1Rdaxdj8',
    thumbnailUrl: 'https://i.ytimg.com/vi/SLC1Rdaxdj8/mqdefault.jpg',
    videoSummary: 'almond milk, iced 처럼 오늘 발음 포인트로 지적된 단어가 실제 대화에서 어떻게 쓰이는지 확인할 수 있습니다.',
  },
];

// ------------------------------------------------------------ 세션 진행 상태
// 새로고침하면 처음부터 다시 시연할 수 있도록 모듈 스코프에만 둔다.
let state = { optionType: 'DIALOGUE', turnIndex: 0 };

const scriptFor = (optionType) => SCRIPTS[optionType] ?? SCRIPTS.DIALOGUE;

// ------------------------------------------------------------------ 핸들러
export const demoHandlers = [
  // ---- 인증 / 구독 : restoreSession 이 이 둘을 호출해 Premium 세션을 만든다 ----
  http.get('*/api/users/me', () => ok(DEMO_USER)),

  http.get('*/api/payments/subscription', () =>
    ok({
      planStatus: 'ACTIVE',
      planType: 'MONTHLY',
      productName: 'Mapingo Premium',
      startedAt: '2026-08-01T00:00:00',
      expiresAt: '2026-09-01T00:00:00',
    }),
  ),

  // ---- AI 코칭 진입 ----
  http.get('*/api/coaching/entry/:sessionId', ({ params }) => {
    state = { optionType: 'DIALOGUE', turnIndex: 0 };
    return ok({ ...DEMO_ENTRY, sessionId: Number(params.sessionId) || DEMO_ENTRY.sessionId });
  }),

  // ---- 코칭 세션 시작 ----
  http.post('*/api/coaching/flow/start', async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    state = { optionType: body?.optionType ?? 'DIALOGUE', turnIndex: 0 };

    return ok({
      coachingSessionId: 1,
      sessionId: body?.sessionId ?? 1,
      userId: DEMO_USER.userId,
      coachingSessionStatus: 'RUNNING',
      selectedOption: state.optionType,
      currentTurnOrder: 0,
      initialMessage: '좋아요. 방금 카페에서 나눈 대화를 바탕으로 조금 더 연습해 볼게요.',
    });
  }),

  // ---- 대화 스크립트 준비 ----
  http.post('*/api/coaching/conversation/script', async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    const optionType = body?.optionType ?? state.optionType;
    state = { optionType, turnIndex: 0 };

    return ok({
      coachingSessionId: 1,
      turns: scriptFor(optionType).map((turn, i) => ({
        coachingScriptTurnId: i + 1,
        coachingSessionId: 1,
        turnOrder: i + 1,
        assistantText: turn.assistantText,
        expectedText: turn.expectedText,
        createdAt: '2026-08-25T10:00:00',
      })),
    });
  }),

  // ---- 대화 시작: 첫 AI 발화 ----
  http.post('*/api/coaching/conversation/:id/start', () => {
    const turns = scriptFor(state.optionType);
    state.turnIndex = 0;

    return ok({
      coachingSessionId: 1,
      coachingScriptTurnId: 1,
      turnOrder: 1,
      assistantText: turns[0].assistantText,
      expectedText: turns[0].expectedText,
      // 실제 서비스에서는 Azure TTS 결과 URL 이 온다. 데모에서는 음성 없이 텍스트만.
      assistantAudioUrl: null,
    });
  }),

  // ---- 사용자 음성 처리 (STT + 발음 평가 + 다음 AI 발화) ----
  http.post('*/api/coaching/conversation/:id/speech', async () => {
    const turns = scriptFor(state.optionType);
    const i = Math.min(state.turnIndex, turns.length - 1);
    const turn = turns[i];
    const nextIndex = i + 1;
    const conversationEnded = nextIndex >= turns.length;

    state.turnIndex = nextIndex;

    // 실제 STT 는 사용자가 말한 내용을 인식하지만, 데모에서는 마이크 없이도
    // 흐름을 볼 수 있도록 스크립트의 기준 문장을 인식 결과로 사용한다.
    return ok({
      userMessageId: 100 + i,
      coachingScriptTurnId: i + 1,
      turnOrder: i + 1,
      recognizedText: turn.expectedText,
      accuracyScore: turn.accuracyScore,
      fluencyScore: turn.fluencyScore,
      completenessScore: turn.completenessScore,
      pronunciationScore: turn.pronunciationScore,
      userFeedback: turn.userFeedback,
      problemWords: turn.problemWords,
      conversationEnded,
      nextScriptTurnId: conversationEnded ? null : nextIndex + 1,
      nextTurnOrder: conversationEnded ? null : nextIndex + 1,
      nextAssistantText: conversationEnded ? null : turns[nextIndex].assistantText,
      nextAssistantAudioUrl: null,
    });
  }),

  // ---- 대화 종료: 최종 피드백 ----
  // PronunciationPracticeSection 은 result.pronunciationResults.pronunciationResults 로
  // 한 단계 더 들어가서 문장별 결과를 읽고, YoutubeRecommendationSection 은
  // result.contents.contents 를 읽는다. 중첩 구조를 그대로 맞춘다.
  http.post('*/api/coaching/conversation/:id/finish', () => {
    const turns = scriptFor(state.optionType);

    return ok({
      coachingSessionId: 1,
      coachingSessionStatus: 'FINISHED',
      feedback: FINAL_FEEDBACK,
      pronunciationResults: {
        pronunciationResults: turns.map((turn, i) => {
          return {
            pronunciationResultId: i + 1,
            coachingMessageId: 100 + i,
            coachingScriptTurnId: i + 1,
            expectedText: turn.expectedText,
            recognizedText: turn.expectedText,
            accuracyScore: turn.accuracyScore,
            fluencyScore: turn.fluencyScore,
            completenessScore: turn.completenessScore,
            pronunciationScore: turn.pronunciationScore,
            feedback: turn.userFeedback,
            problemWords: turn.problemWords,
          };
        }),
      },
      contents: { contents: YOUTUBE_PICKS },
    });
  }),

  // ---- 저장된 메시지 목록 ----
  http.get('*/api/coaching/messages/:id', () => {
    const turns = scriptFor(state.optionType);
    const messages = [];
    turns.forEach((turn, i) => {
      messages.push({
        coachingMessageId: i * 2 + 1, coachingSessionId: 1, coachingScriptTurnId: i + 1,
        role: 'ASSISTANT', message: turn.assistantText, audioUrl: null,
      });
      messages.push({
        coachingMessageId: i * 2 + 2, coachingSessionId: 1, coachingScriptTurnId: i + 1,
        role: 'USER', message: turn.expectedText, audioUrl: null,
      });
    });
    return ok(messages);
  }),
];
