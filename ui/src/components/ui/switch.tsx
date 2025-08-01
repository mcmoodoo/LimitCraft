import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from 'src/lib/utils';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-gray-600 focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-gray-600 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border-2 border-gray-500 shadow-lg transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'bg-white dark:data-[state=unchecked]:bg-white dark:data-[state=checked]:bg-white pointer-events-none block size-4 rounded-full shadow-md ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0'
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
