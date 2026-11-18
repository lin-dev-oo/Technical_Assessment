import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '../../lib/utils';
export function Progress({ value = 0, className, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return <ProgressPrimitive.Root className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/12', className)} value={value} {...props}><ProgressPrimitive.Indicator className="h-full w-full bg-primary transition-transform" style={{ transform: `translateX(-${100 - (value || 0)}%)` }}/></ProgressPrimitive.Root>;
}
