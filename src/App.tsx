import { RouterProvider } from 'react-router-dom';
import { AuthGate } from '@/components/AuthGate';
import { router } from './router';

export function App() {
  return (
    <AuthGate>
      <RouterProvider router={router} />
    </AuthGate>
  );
}
