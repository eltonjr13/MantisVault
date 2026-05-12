export function calculateSavings(originalSize: number, finalSize: number, minimumGainPercent: number): {
  savedBytes: number;
  savedPercent: number;
  accepted: boolean;
  reason: string;
} {
  const savedBytes = originalSize - finalSize;
  const savedPercent = originalSize > 0 ? (savedBytes / originalSize) * 100 : 0;

  if (finalSize >= originalSize) {
    return {
      savedBytes,
      savedPercent,
      accepted: false,
      reason: "Otimização descartada porque o arquivo final ficou maior ou igual ao original."
    };
  }

  if (savedPercent < minimumGainPercent) {
    return {
      savedBytes,
      savedPercent,
      accepted: false,
      reason: "Otimização descartada porque a economia ficou abaixo do mínimo configurado."
    };
  }

  return {
    savedBytes,
    savedPercent,
    accepted: true,
    reason: "Otimizado sem perda."
  };
}
