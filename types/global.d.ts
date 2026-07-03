import type * as React from 'react';

// Ionicons se usa como web component (<ion-icon name="...">), igual que en el
// legacy. Esta declaración lo hace válido en JSX.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ion-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        name?: string;
        src?: string;
        size?: string;
        // React 19 pasa `class` directo a custom elements (paridad con el markup legacy)
        class?: string;
      };
    }
  }
}

export {};
