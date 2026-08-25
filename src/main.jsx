window.global = window;

import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { useAuth } from './hooks/user/useAuth';

const queryClient = new QueryClient();

// 앱 시작 시 세션 복원
function AppWithRestore() {
    const { restoreSession } = useAuth();

    useEffect(() => {
        restoreSession();
    }, []);

    return <App />;
}

// 백엔드 없이 AI 코칭 기능을 시연하기 위한 데모 모드.
// VITE_DEMO_STANDALONE=true 로 빌드했을 때만 MSW 가 뜬다.
async function prepare() {
    if (import.meta.env.VITE_DEMO_STANDALONE !== 'true') return;

    const { worker, seedDemoState } = await import('./mocks/demo/browser');

    await worker.start({
        onUnhandledRequest: 'bypass', // 핸들러 없는 요청은 그대로 통과
        serviceWorker: { url: '/mockServiceWorker.js' },
        quiet: true,
    });

    seedDemoState();
}

prepare().then(() => {
    createRoot(document.getElementById('root')).render(
        // <StrictMode>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <AppWithRestore />
                </BrowserRouter>
            </QueryClientProvider>
        // </StrictMode>
    );
});