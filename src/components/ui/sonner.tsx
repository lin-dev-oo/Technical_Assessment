import { CheckCircle2, CircleAlert, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return <SonnerToaster className="app-toaster" theme="light" position="bottom-right" closeButton
    icons={{ success: <CheckCircle2 size={18}/>, error: <CircleAlert size={18}/>, warning: <TriangleAlert size={18}/>, info: <Info size={18}/>, loading: <LoaderCircle size={18} className="animate-spin"/> }}
    toastOptions={{ duration: 5000, classNames: { toast: 'app-toast', title: 'app-toast-title', description: 'app-toast-description', actionButton: 'app-toast-action', cancelButton: 'app-toast-cancel', closeButton: 'app-toast-close' } }}/>;
}
