import { displayFlex, styled } from '@affine/component';
import { baseTheme } from '@toeverything/theme';

export const StyledSliderBarInnerWrapper = styled('div')(() => {
  return {
    flexGrow: 1,
    margin: '0 2px',
    position: 'relative',
    height: 'calc(100% - 52px * 2)',
    display: 'flex',
    flexDirection: 'column',
  };
});

export const StyledNewPageButton = styled('button')(() => {
  return {
    width: '100%',
    height: '52px',
    ...displayFlex('flex-start', 'center'),
    padding: '0 16px',
    svg: {
      fontSize: '20px',
      color: 'var(--affine-icon-color)',
      marginRight: '12px',
    },
    ':hover': {
      color: 'var(--affine-primary-color)',
      svg: {
        color: 'var(--affine-primary-color)',
      },
    },
  };
});
export const StyledSliderModalBackground = styled('div')<{ active: boolean }>(({
  active,
}) => {
  return {
    transition: 'opacity .15s',
    pointerEvents: active ? 'auto' : 'none',
    opacity: active ? 1 : 0,
    position: 'fixed',
    top: 0,
    left: 0,
    right: active ? 0 : '100%',
    bottom: 0,
    zIndex: parseInt(baseTheme.zIndexModal) - 1,
    background: 'var(--affine-background-modal-color)',
  };
});

export const StyledScrollWrapper = styled('div')<{
  showTopBorder: boolean;
}>(({ showTopBorder }) => {
  return {
    maxHeight: '50%',
    overflowY: 'auto',
    borderTop: '1px solid',
    borderColor: showTopBorder ? 'var(--affine-border-color)' : 'transparent',
  };
});
