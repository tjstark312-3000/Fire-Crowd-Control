import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tracking-wide', {
  variants: {
    variant: {
      default: 'border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] text-[hsl(var(--foreground))]',
      success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
      warning: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
      danger: 'border-red-500/40 bg-red-500/10 text-red-200',
      muted: 'border-[hsl(var(--border))] bg-transparent text-[hsl(var(--muted-foreground))]',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>): JSX.Element {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
