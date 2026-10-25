import React from 'react';

export interface NextLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
}

const LinkComponent: React.FC<NextLinkProps> = ({ href, children, className, onClick, ...props }) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);
    if (href.startsWith('/') && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      window.history.pushState({}, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <a href={href} className={className} onClick={handleClick} {...props}>
      {children}
    </a>
  );
};

export const Link = LinkComponent;
export default LinkComponent;
