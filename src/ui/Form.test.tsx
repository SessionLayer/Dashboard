import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TextField } from './Form';

describe('Form control ARIA', () => {
  it('marks required and links the hint via aria-describedby', () => {
    render(
      <TextField
        label="Name"
        value=""
        onChange={() => undefined}
        required
        hint="Must be unique"
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).not.toHaveAttribute('aria-invalid');
    const describedby = input.getAttribute('aria-describedby');
    expect(describedby).not.toBeNull();
    expect(screen.getByText('Must be unique')).toHaveAttribute(
      'id',
      describedby,
    );
  });

  it('marks invalid and associates the error message', () => {
    render(
      <TextField
        label="Port"
        value="x"
        onChange={() => undefined}
        error="Must be a number"
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Port' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedby = input.getAttribute('aria-describedby');
    expect(screen.getByRole('alert')).toHaveAttribute('id', describedby);
  });
});
