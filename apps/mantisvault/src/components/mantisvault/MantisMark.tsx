export function MantisMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M32 5 54 17v24L32 59 10 41V17L32 5Z" stroke="currentColor" strokeWidth="4" />
      <path d="M20 21 32 12l12 9-5 18-7 7-7-7-5-18Z" fill="currentColor" opacity="0.18" />
      <path d="M21 25 8 16M43 25l13-9M25 40l-9 9M39 40l9 9" stroke="#FF544A" strokeWidth="4" strokeLinecap="round" />
      <path d="M26 26h.01M38 26h.01" stroke="#F2EDE6" strokeWidth="5" strokeLinecap="round" />
      <path d="M25 35h14" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function MantisMascot() {
  return (
    <svg className="mantis-svg" viewBox="0 0 520 520" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="mantisTeal" x1="120" x2="410" y1="80" y2="430" gradientUnits="userSpaceOnUse">
          <stop stopColor="#19C6B3" />
          <stop offset="1" stopColor="#0F6B63" />
        </linearGradient>
        <linearGradient id="mantisCoral" x1="54" x2="450" y1="380" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF544A" />
          <stop offset="1" stopColor="#FF8A5C" />
        </linearGradient>
      </defs>
      <path d="M265 95c69 0 125 56 125 125v67c0 67-54 121-121 121h-10c-67 0-121-54-121-121v-67c0-69 56-125 127-125Z" fill="url(#mantisTeal)" opacity="0.9" />
      <path d="M175 202c-34-55-51-97-50-126 35 17 67 47 96 90l-46 36Z" fill="#0F6B63" stroke="#19C6B3" strokeWidth="5" />
      <path d="M349 202c34-55 51-97 50-126-35 17-67 47-96 90l46 36Z" fill="#0F6B63" stroke="#19C6B3" strokeWidth="5" />
      <path d="M152 323C87 308 47 269 32 205c66 5 112 31 137 79l-17 39Z" fill="url(#mantisCoral)" stroke="#FF6B5C" strokeWidth="6" />
      <path d="M368 323c65-15 105-54 120-118-66 5-112 31-137 79l17 39Z" fill="url(#mantisCoral)" stroke="#FF6B5C" strokeWidth="6" />
      <path d="M212 215c-25 8-44 25-58 51M309 215c25 8 44 25 58 51" stroke="#061013" strokeWidth="10" strokeLinecap="round" opacity="0.42" />
      <path d="M215 252c0 22-18 40-40 40s-40-18-40-40 18-40 40-40 40 18 40 40Z" fill="#0A1013" stroke="#19C6B3" strokeWidth="7" />
      <path d="M385 252c0 22-18 40-40 40s-40-18-40-40 18-40 40-40 40 18 40 40Z" fill="#0A1013" stroke="#19C6B3" strokeWidth="7" />
      <path d="M187 244c0 9-7 16-16 16s-16-7-16-16 7-16 16-16 16 7 16 16ZM353 244c0 9-7 16-16 16s-16-7-16-16 7-16 16-16 16 7 16 16Z" fill="#F2EDE6" />
      <path d="M225 330h75l-37 42-38-42Z" fill="#081015" opacity="0.72" />
      <path d="M230 405c-52-8-90-29-114-63M290 405c52-8 90-29 114-63" stroke="#19C6B3" strokeWidth="7" strokeLinecap="round" opacity="0.8" />
      <path d="M236 129c18-42 17-80-3-114M286 129c-10-45-4-83 18-114" stroke="#FF544A" strokeWidth="8" strokeLinecap="round" />
      <path d="M92 397c34 22 75 39 124 49M426 397c-34 22-75 39-124 49" stroke="#FF544A" strokeWidth="8" strokeLinecap="round" opacity="0.78" />
    </svg>
  );
}
