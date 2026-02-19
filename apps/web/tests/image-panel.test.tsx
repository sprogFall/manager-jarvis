import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ImagePanel } from '@/components/panels/image-panel';
import type { ImageSummary } from '@/lib/types';

const images: ImageSummary[] = [
  { id: 'sha256:abc', tags: ['nginx:latest'], size: 1234, created: '2026-01-01T00:00:00Z' },
];

describe('ImagePanel', () => {
  it('loads image list and submits pull request', async () => {
    const user = userEvent.setup();
    const loadImages = vi.fn().mockResolvedValue(images);
    const pullImage = vi.fn().mockResolvedValue({ task_id: 'task-1' });

    render(
      <ImagePanel
        loadImages={loadImages}
        pullImage={pullImage}
        deleteImage={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByText('nginx:latest')).toBeInTheDocument();
    await user.type(screen.getByLabelText('镜像名'), 'redis');
    await user.type(screen.getByLabelText('Tag'), '7');
    await user.click(screen.getByRole('button', { name: '拉取镜像' }));

    await waitFor(() => {
      expect(pullImage).toHaveBeenCalledWith({ image: 'redis', tag: '7' });
    });
  });
});
