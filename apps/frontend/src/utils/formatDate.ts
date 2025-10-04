export const formatDate = (dateString: string, format: 'short' | 'long' = 'long') => {
  let formattedDate;
  if (format === 'short')
    formattedDate = new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  else
    formattedDate = new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  return formattedDate;
};
