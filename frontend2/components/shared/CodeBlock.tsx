type Props = {
    code: string;
    className?: string;
};

export default function CodeBlock({ code, className }: Props) {
    return (
        <pre className={"bg-neutral-100 p-4 rounded border border-neutral-200 font-mono text-sm overflow-x-auto " + (className ?? "")}>
            <code className="text-black whitespace-pre">{code}</code>
        </pre>
    );
}
