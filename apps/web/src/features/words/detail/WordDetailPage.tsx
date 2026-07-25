import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { WordDetails } from './components/WordDetails';

export function WordDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="lg:ml-auto lg:max-w-md">
      <Link to="/words" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft size={16} /> Back to your words
      </Link>
      <WordDetails id={id} sticky onDeleted={() => navigate('/words')} />
    </div>
  );
}
