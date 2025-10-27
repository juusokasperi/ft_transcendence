// src/components/ui/SplitButton.tsx
import * as React from 'react';
import IconButton from '@mui/material/IconButton';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Grow from '@mui/material/Grow';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';

type SplitButtonProps = {
  targetUser: string;
  isBlocked: boolean;
  onAction: (action: string, target: string) => void;
};

export default function SplitButton({ targetUser, isBlocked, onAction }: SplitButtonProps) {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLButtonElement | null>(null);

  const options = isBlocked
    ? ['Unblock user', 'View profile']
    : ['Send private message', 'Block user', 'Invite to game', 'View profile'];

  const handleMenuItemClick = (
    event: React.MouseEvent<HTMLLIElement, MouseEvent>,
    index: number,
  ) => {
    setOpen(false);
    const action = options[index];
    if (action !== undefined) {
      onAction(action, targetUser);
    }
  };

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleClose = (event: Event | React.MouseEvent) => {
    if (anchorRef.current && anchorRef.current.contains(event.target as Node)) {
      return;
    }
    setOpen(false);
  };

  return (
    <>
      <IconButton
        ref={anchorRef}
        size="small"
        aria-controls={open ? 'split-button-menu' : undefined}
        aria-expanded={open ? 'true' : undefined}
        aria-haspopup="menu"
        onClick={handleToggle}
        sx={{
          minWidth: 28,
          width: 28,
          height: 28,
          padding: 0.25,
          color: 'rgba(255,255,255,0.9)',
          // subtle indigo hover ring to match app theme
          '&:hover': { backgroundColor: 'rgba(99,102,241,0.10)' },
        }}
      >
        <ArrowDropDownIcon fontSize="small" />
      </IconButton>

      <Popper
        open={open}
        anchorEl={anchorRef.current}
        transition
        placement="bottom-end"
        modifiers={[
          { name: 'offset', options: { offset: [0, 8] } },
          { name: 'preventOverflow', options: { padding: 8 } },
          { name: 'flip', options: { fallbackPlacements: ['top', 'right', 'left'] } },
        ]}
        sx={{ zIndex: 1400 }}
      >
        {({ TransitionProps, placement }) => (
          <Grow
            {...TransitionProps}
            style={{
              transformOrigin: placement === 'bottom' ? 'center top' : 'center bottom',
            }}
          >
            <Paper
              elevation={6}
              sx={{
                minWidth: 200,
                bgcolor: 'rgba(15,23,42,0.96)', // deep/transparent dark
                border: '1px solid rgba(255,255,255,0.04)',
                boxShadow: '0 8px 24px rgba(2,6,23,0.6)',
                color: 'white',
                overflow: 'hidden',
              }}
            >
              <ClickAwayListener onClickAway={handleClose}>
                <MenuList autoFocusItem={open} id="split-button-menu" dense>
                  {options.map((option, index) => {
                    // extra color affordance for destructive/success actions
                    const isBlock = option.toLowerCase().includes('block');
                    const isUnblock = option.toLowerCase().includes('unblock');
                    const hoverBg = isBlock
                      ? 'rgba(244,63,94,0.12)'
                      : isUnblock
                        ? 'rgba(16,185,129,0.12)'
                        : 'rgba(99,102,241,0.10)';
                    const textColor = isBlock
                      ? '#fb7185'
                      : isUnblock
                        ? '#10b981'
                        : 'rgba(241,245,249,0.95)';

                    return (
                      <MenuItem
                        key={option}
                        onClick={(event) => handleMenuItemClick(event, index)}
                        sx={{
                          px: 2.5,
                          py: 1,
                          gap: 1,
                          // base colors
                          color: textColor,
                          fontSize: '0.95rem',
                          // hover style
                          '&:hover': {
                            backgroundColor: hoverBg,
                            color: isBlock ? '#fff' : textColor,
                          },
                        }}
                      >
                        {option}
                      </MenuItem>
                    );
                  })}
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </>
  );
}
