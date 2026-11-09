// One icon family: 20px box, 1.75 stroke, round joins. All icons are
// decorative: the text next to them carries the meaning.

import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="m13.2 13.2 3.6 3.6" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4.5v11M4.5 10h11" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
  </Icon>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="6.75" />
    <path d="M10 6.2V10l2.5 1.7" />
  </Icon>
);

export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 17.2s5-4.5 5-8.4a5 5 0 0 0-10 0c0 3.9 5 8.4 5 8.4Z" />
    <circle cx="10" cy="8.8" r="1.8" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="13" height="12" rx="2" />
    <path d="M3.5 8.5h13M7 2.8v3M13 2.8v3M10 10.6v3.6m0 0-1.6-1.6m1.6 1.6 1.6-1.6" />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.2 17.2 16H2.8L10 3.2Z" />
    <path d="M10 8.2v3.4M10 13.9v.1" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10h12m0 0-4.5-4.5M16 10l-4.5 4.5" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5.5 8 4.5 4.5L14.5 8" />
  </Icon>
);

export const PeopleIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7.4" cy="7.2" r="2.6" />
    <path d="M2.6 16c.4-2.7 2.3-4.2 4.8-4.2s4.4 1.5 4.8 4.2" />
    <path d="M13.2 4.9a2.5 2.5 0 0 1 0 4.7M14.6 12c1.6.5 2.6 1.8 2.9 3.9" />
  </Icon>
);

export const CaptionsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.8" y="4.5" width="14.4" height="11" rx="2.2" />
    <path d="M8.6 8.9a1.9 1.9 0 1 0 0 2.2M14 8.9a1.9 1.9 0 1 0 0 2.2" />
  </Icon>
);

export const StepFreeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 15.5h14M3 15.5 17 8.5v7" />
    <path d="M6.5 6.5h5m0 0L9.4 4.4m2.1 2.1L9.4 8.6" />
  </Icon>
);

export const SignLanguageIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 10V4.6a1.1 1.1 0 0 1 2.2 0V9m0-1.2V3.9a1.1 1.1 0 0 1 2.2 0V9m0-3.6a1.1 1.1 0 0 1 2.2 0V11" />
    <path d="M13.6 9.4a1.1 1.1 0 0 1 2.2 0v2.4c0 3.1-2 5.4-5 5.4-2.2 0-3.4-.9-4.6-2.7L4.4 11.600a1.1 1.1 0 0 1 1.900-1.100L7 11.600" />
  </Icon>
);

export const LowSensoryIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.2 8.400a3.900 3.900 0 0 1 7.800 0c0 2.300-2.100 2.800-2.100 4.800a2.200 2.200 0 0 1-4.100 1.100" />
    <path d="M8.600 8.500a1.600 1.600 0 0 1 3.100 0" />
    <path d="m3.500 3.500 13 13" />
  </Icon>
);

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="3.2" />
    <path d="M10 2.8v1.6M10 15.600v1.600M2.800 10h1.600M15.600 10h1.600M4.900 4.900l1.100 1.100M14 14l1.100 1.100M15.100 4.900 14 6M6 14l-1.100 1.100" />
  </Icon>
);

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16.200 11.800A6.600 6.600 0 0 1 8.200 3.800a6.600 6.600 0 1 0 8 8Z" />
  </Icon>
);

export const AutoThemeIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="6.750" />
    <path d="M10 3.250v13.500" />
    <path d="M10 6.500 14.500 5.200M10 10h6.600M10 13.500l4.500 1.300" />
  </Icon>
);

export const SlidersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.500 6h7M14.500 6h2M3.500 14h2M9.500 14h7" />
    <circle cx="12.500" cy="6" r="2" />
    <circle cx="7.500" cy="14" r="2" />
  </Icon>
);

export const MessageIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.500 5.800A2.300 2.300 0 0 1 5.800 3.500h8.400a2.300 2.300 0 0 1 2.300 2.300v5.400a2.300 2.300 0 0 1-2.300 2.300H9.600l-3.800 3v-3A2.300 2.300 0 0 1 3.500 11.200V5.800Z" />
  </Icon>
);

export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.500 5.500h9M7.500 10h9M7.500 14.500h9M3.800 5.500h.1M3.800 10h.1M3.800 14.500h.1" />
  </Icon>
);
