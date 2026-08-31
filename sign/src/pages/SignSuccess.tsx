import { useLocation, useNavigate } from 'react-router-dom';
import SealPreview from '../components/SealPreview';

interface SignSuccessState {
  sealId: string;
  signerName: string;
  documentName: string;
  signedAt: string;
}

export default function SignSuccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as SignSuccessState | null;

  if (!state) {
    navigate('/history', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
      <div className="w-full flex items-center gap-3 px-0 pb-6">
        <button onClick={() => navigate('/history')} className="text-gray-400 text-xl leading-none">←</button>
      </div>
      <img src="/Relish-Logo.png" alt="Relish" className="h-10 mb-6" />

      <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center mb-4">
        <span className="text-2xl">✅</span>
      </div>

      <h1 className="text-xl font-bold text-relish-purple mb-1">Document Signed</h1>
      <p className="text-sm text-gray-500 mb-6 truncate max-w-full">{state.documentName}</p>

      <SealPreview
        data={{
          signerName: state.signerName,
          sealId: state.sealId,
          signedAt: new Date(state.signedAt),
        }}
        className="mb-4"
      />

      <p className="text-xs font-mono text-relish-orange mt-2">{state.sealId}</p>
      <p className="text-xs text-gray-400 mt-1">
        {new Date(state.signedAt).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false,
        })} IST
      </p>

      <button
        onClick={() => navigate('/history', { replace: true })}
        className="mt-8 bg-relish-purple text-white rounded-lg py-3 px-8 font-semibold text-sm"
      >
        Done
      </button>
    </div>
  );
}
