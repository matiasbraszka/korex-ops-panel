import { defineConfig } from 'vitest/config';

// Tests de funciones puras (utils). Environment node alcanza: no hay
// componentes React testeados todavia. Si se agregan tests de componentes,
// cambiar a jsdom e instalar @testing-library/react.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
