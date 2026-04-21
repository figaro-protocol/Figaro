import React from "react";

interface OrderErrorMessageProps {
    error?: string;
}

const OrderErrorMessage: React.FC<OrderErrorMessageProps> = ({ error }) => {
    if (!error) return null;
    return (
        <div className="py-2">
            <div className="text-xs text-red-700 font-medium">Error: {error}</div>
        </div>
    );
};

export default OrderErrorMessage;
