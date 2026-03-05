import Chip, { type ChipProps } from '@mui/material/Chip';
import { useTheme } from '@mui/material/styles';

type Status = 'SUCCESS' | 'FAILED' | 'PENDING';

interface StatusChipProps extends Omit<ChipProps, 'color'> {
  status: Status;
}

export function StatusChip({ status, ...props }: StatusChipProps) {
  const theme = useTheme();
  const map = {
    SUCCESS: {
      bg: theme.palette.success?.light,
      fg: theme.palette.success?.main,
      bd: theme.palette.success?.main,
    },
    FAILED: {
      bg: theme.palette.failed?.light,
      fg: theme.palette.failed?.main,
      bd: theme.palette.failed?.main,
    },
    PENDING: {
      bg: theme.palette.pending?.light,
      fg: theme.palette.pending?.main,
      bd: theme.palette.pending?.main,
    },
  }[status];

  return (
    <Chip
      size="small"
      label={status}
      sx={{
        fontWeight: 700,
        fontSize: 15,
        p: 1,
        bgcolor: map.bg,
        color: 'map.fg',
        borderColor: 'transparent',
        borderWidth: 1,
        borderStyle: 'solid',
        '& .MuiChip-label': { px: 1 },
      }}
      {...props}
    />
  );
}
