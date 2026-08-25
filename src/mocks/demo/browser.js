import { setupWorker } from 'msw/browser';
import { demoHandlers } from './handlers';

export const worker = setupWorker(...demoHandlers);

// 데모 모드에서만 호출된다.
// restoreSession() 은 localStorage 의 accessToken 이 있어야 /api/users/me 를 부르고,
// 그 응답으로 Premium 세션이 만들어져 AI 코칭 화면에 진입할 수 있다.
// CoachingPage 는 sessionId 를 쿼리스트링 → ... → localStorage 순으로 찾으므로
// 메뉴로 그냥 /coaching 을 눌러도 동작하도록 마지막 세션 ID 를 심어 둔다.
export function seedDemoState() {
  try {
    localStorage.setItem('accessToken', 'demo-access-token');
    localStorage.setItem('lastCoachingLearningSessionId', '1');
  } catch {
    // 시크릿 모드 등에서 localStorage 가 막혀 있어도 앱은 그대로 뜬다.
  }
}
