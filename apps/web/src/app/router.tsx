import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { HomePage } from '@/features/home/HomePage';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h1 className="text-heading font-bold text-deep">{title}</h1>
      <p className="mt-2 text-muted">Coming soon</p>
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/words" element={<Placeholder title="My Words" />} />
          <Route path="/read" element={<Placeholder title="Read" />} />
          <Route path="/progress" element={<Placeholder title="Progress" />} />
          <Route path="/add" element={<Placeholder title="Add Words" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
