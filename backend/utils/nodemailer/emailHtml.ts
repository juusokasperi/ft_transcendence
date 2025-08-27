export const confirmationEmailHtml = (confirmUrl: string, frontendUrl: string): string => {
	return `<div
		style="font-family: sans-serif; max-width: 400px; margin: 2rem auto;
		padding: 1rem; border-radius: 0.5rem;">
		<h2>Confirm your email address to get started on playing BabylonPong</h2>
			<a
				href="${confirmUrl}"
				style="
					text-decoration: none;
					background-color: #161f30;
					color: white;
					padding: 0.5rem 2rem;
					border-radius: 0.3rem;
					font-weight: bold;" >
			Confirm my email
			</a>
			<p style="padding: 1rem 0; line-height: 2rem; font-size: 14px">
				This link is valid for 24 hours. If you didn't register, please ignore this email.
			</p>
		<a href="${frontendUrl}" target="_blank" style="color: black">BabylonPong</a>
	</div>`;
};

export const resetPasswordHtml = (resetUrl: string, frontendUrl: string): string => {
	return `<div
		style="font-family: sans-serif; max-width: 400px; margin: 2rem auto;
		padding: 1rem; border-radius: 0.5rem;">
		<h2>Reset your password for BabylonPong</h2>
			<a
				href="${resetUrl}"
				style="
					text-decoration: none;
					background-color: #161f30;
					color: white;
					padding: 0.5rem 2rem;
					border-radius: 0.3rem;
					font-weight: bold;" >
			Reset my password
			</a>
			<p style="padding: 1rem 0; line-height: 2rem; font-size: 14px">
				This link is valid for 30 minutes. If you didn't ask for a password change, please ignore this email.
			</p>
		<a href="${frontendUrl}" target="_blank" style="color: black">BabylonPong</a>
	</div>`;
};
