import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export const prettierErrorMessages = (error: FastifyError, request: FastifyRequest, res: FastifyReply) => {
  if (error.validation) {
    const friendlyErrors = error.validation.map((err: any) => {
      const field = err.instancePath.replace('/body/', '').replace('/', '');

      if (field === 'username') {
        if (err.keyword === 'pattern') {
          return { field, message: 'Username can only contain letters, numbers, and hyphens (no consecutive hyphens or starting with hyphen)' };
        }
      }

      if (field === 'email') {
        if (err.keyword === 'format') {
          return { field, message: 'Please enter a valid email address' };
        }
      }

      if (field === 'password') {
        if (err.keyword === 'minLength') {
          return { field, message: 'Password must be at least 12 characters long' };
        }
        if (err.keyword === 'pattern') {
          if (err.schemaPath.includes('allOf/0')) {
            return { field, message: 'Password has invalid characters' };
          }
          if (err.schemaPath.includes('allOf/1')) {
            return { field, message: 'Password must contain at least one lowercase letter' };
          }
          if (err.schemaPath.includes('allOf/2')) {
            return { field, message: 'Password must contain at least one uppercase letter' };
          }
          if (err.schemaPath.includes('allOf/3')) {
            return { field, message: 'Password must contain at least one number' };
          }
          if (err.schemaPath.includes('allOf/4')) {
            return { field, message: 'Password must contain at least one special character' };
          }
        }
      }

      return { field, message: err.message };
    });

    res.status(400).send({
      message: 'Validation failed',
      details: friendlyErrors
    });
    return;
  }

  res.send(error);
}
