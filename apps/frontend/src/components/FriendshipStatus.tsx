import React, { useState } from 'react';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import { useAppContext } from '../context/AppContext';
import { useSnackbar } from '../context/SnackbarContext';
import { AxiosError } from 'axios';
import type { Friendship } from '../types';

interface Props {
  friendship: Friendship;
  uuid: string;
  onStatusChange: (status: Friendship) => void;
  onRefreshFriendship?: () => void;
}

const friendshipTexts: Record<Friendship, string> = {
  friends: 'Delete friend',
  request_sent: 'Cancel',
  request_received: '',
  none: 'Add friend',
};

const friendshipHeaderTexts: Record<Friendship, string> = {
  friends: 'You are friends',
  request_sent: 'Friend Request Sent',
  request_received: '',
  none: 'You are not friends',
};

const buttonStyle = 'text-xs uppercase tracking-[0.25em]';

const FriendshipStatus: React.FC<Props> = ({
  friendship,
  uuid,
  onStatusChange,
  onRefreshFriendship,
}) => {
  const { axios } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();

  const handleFriendship = async (accept?: boolean) => {
    try {
      if (friendship === 'friends') {
        await axios.delete(`/api/friends/${uuid}`);
        onStatusChange('none');
        enqueueSnackbar({ message: 'Removed from Friends list', variant: 'success' });
      } else if (friendship === 'none') {
        await axios.post('/api/friends/', { username: uuid });
        onStatusChange('request_sent');
        enqueueSnackbar({ message: 'Friend request sent', variant: 'success' });
      } else if (friendship === 'request_sent') {
        await axios.delete(`/api/friends/${uuid}`);
        onStatusChange('none');
        enqueueSnackbar({ message: 'Friend request canceled', variant: 'success' });
      } else if (friendship === 'request_received') {
        await axios.patch(`/api/friends/respond/${uuid}`, { accept: accept ?? false });
        onStatusChange(accept ? 'friends' : 'none');
        enqueueSnackbar(
          accept
            ? { message: 'Friend request accepted', variant: 'success' }
            : { message: 'Friend request declined', variant: 'success' },
        );
      }
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(axiosErr?.response?.data?.message ?? 'Failed to fetch friendship status'),
        variant: 'error',
      });
      if (onRefreshFriendship) onRefreshFriendship();
    }
  };

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  if (friendship === 'request_received') {
    return (
      <div className="flex flex-col gap-3 tracking-[0.25em] text-slate-400">
        <Button className={buttonStyle} disabled variant="ghost">
          Friendship Request Received
        </Button>
        <Button
          className={buttonStyle}
          variant="successSecondary"
          onClick={() => handleFriendship(true)}
        >
          Accept
        </Button>
        <Button
          className={buttonStyle}
          variant="dangerSecondary"
          onClick={() => handleFriendship(false)}
        >
          Reject
        </Button>
      </div>
    );
  }
  return (
    <>
      <div className="flex flex-col gap-3 tracking-[0.25em] text-slate-400">
        <Button className={buttonStyle} disabled variant="ghost">
          {friendshipHeaderTexts[friendship]}
        </Button>
        <Button
          className={buttonStyle}
          variant={
            friendship === 'friends'
              ? 'danger'
              : friendship === 'none'
                ? 'successSecondary'
                : 'secondary'
          }
          tone={friendship === 'friends' ? 'subtle' : 'default'}
          size="md"
          onClick={
            friendship === 'friends' ? () => setShowConfirmDialog(true) : () => handleFriendship()
          }
        >
          {friendshipTexts[friendship]}
        </Button>
      </div>
      <ConfirmDialog
        open={showConfirmDialog}
        title="Remove friend?"
        description="Are you sure you want to remove this friend?"
        confirmLabel="Yes, delete"
        cancelLabel="Keep friend"
        tone="danger"
        onConfirm={async () => {
          await handleFriendship();
          setShowConfirmDialog(false);
        }}
        onCancel={() => setShowConfirmDialog(false)}
      />
    </>
  );
};

export default FriendshipStatus;
