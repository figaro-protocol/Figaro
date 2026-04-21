# Tailwind CSS Style Guide

## Allowed Colors
- Only use: white, black, gray-50 to gray-900
- No gradients, no color backgrounds, no colored text

## Component Styling
- Use className constants or wrapper components for repeated patterns (e.g., NeutralCard)
- Do not use inline utility classes for color except for allowed palette

## Best Practices
- Use only the color palette defined in tailwind.config.ts
- Do not override with inline style or custom CSS for color
- Use ESLint with .eslintrc.tailwind.js to enforce allowed classes
- Document any exceptions in this file

## Example
```tsx
<Card className="bg-white text-black border border-gray-300">...</Card>
```

## Auditing
- Run ESLint to check for forbidden classes: npx eslint --ext .tsx,.ts . --config frontend/.eslintrc.tailwind.js
