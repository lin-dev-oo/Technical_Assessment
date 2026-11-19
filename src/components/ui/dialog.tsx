import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;
function DialogContent({ className, children, closeDisabled = false, showClose = true, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { closeDisabled?: boolean; showClose?: boolean }) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay"/><DialogPrimitive.Content className={cn('dialog-content', className)} {...props}>{children}{showClose && <DialogPrimitive.Close className="dialog-close" disabled={closeDisabled} aria-label="Close review"><X size={18}/></DialogPrimitive.Close>}</DialogPrimitive.Content></DialogPrimitive.Portal>;
}
export { Dialog, DialogContent, DialogTitle, DialogDescription };
