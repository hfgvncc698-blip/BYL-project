const Dialog = ({ children }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
    <div className="bg-white p-4 rounded">{children}</div>
  </div>
);

const DialogTrigger = ({ children, onClick }) => (
  <button onClick={onClick} className="p-2 bg-gray-200 rounded">
    {children}
  </button>
);

const DialogContent = ({ children }) => <div>{children}</div>;

export { Dialog, DialogTrigger, DialogContent };

