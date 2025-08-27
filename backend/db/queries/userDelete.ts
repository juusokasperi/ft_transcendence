import db from '../client.ts';

export function deleteUser(uuid: string): Boolean {
	const result = db.prepare('DELETE FROM Users WHERE uuid = ?').run(uuid);
	return result.changes === 1;
};

export function markUserForDelete(uuid: string, confirmationToken: string): Boolean {
	db.prepare(`DELETE From UsersForDelete WHERE user_uuid = ?`).run(uuid);
	const result = db.prepare(`
		INSERT INTO UsersForDelete (user_uuid, confirmation_token, expires_at)
		VALUES (?, ?, datetime('now', '+24 hours'))
		`).run(uuid, confirmationToken);
	if (!result)
		return false;
	return true;
};

export function removeTokenFromDelete(confirmationToken: string): void {
	db.prepare(`DELETE From UsersForDelete WHERE confirmation_token = ?`).run(confirmationToken);
};

export function findUserToDeleteAndClear(confirmationToken: string): string | undefined {
	const transaction = db.transaction(() => {
		const findResult = db.prepare(`
			SELECT user_uuid FROM UsersForDelete
			WHERE confirmation_token = ? AND expires_at > datetime('now')
		`).get(confirmationToken) as { user_uuid: string } | undefined;
		if (!findResult || !findResult.user_uuid)
			throw new Error('Token not found or expired');
		const deleteResult = db.prepare(`DELETE FROM UsersForDelete WHERE confirmation_token = ?`).run(confirmationToken);
		if (deleteResult.changes === 0)
			throw new Error('Failed to delete token');
		return findResult.user_uuid;
	})

	try {
		return transaction();
	} catch {
		return undefined;
	}
};
