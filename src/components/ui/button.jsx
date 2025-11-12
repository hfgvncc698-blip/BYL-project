const Button = ({ children, ...props }) => (
  <button className="p-2 bg-blue-500 text-white rounded" {...props}>
    {children}
  </button>
);

export { Button };

