/**
 * Utilitário Centralizado de Rolagem Inteligente — Fluxo Financeiro
 *
 * Responsável por executar a rolagem suave até o topo quando o usuário
 * toca novamente na aba já selecionada na navbar (ou no cabeçalho da tela).
 *
 * Características:
 * - Suporta rolagem da janela principal (window / documentElement / body).
 * - Identifica e rola automaticamente containers internos com overflow-y: auto / scroll.
 * - Respeita as preferências de movimento reduzido (prefers-reduced-motion).
 * - Não recarrega a página e preserva 100% dos formulários, filtros e estados React.
 * - Funciona identicamente no mobile (touch) e desktop (mouse/click).
 */

export interface ScrollToTopOptions {
  /**
   * Comportamento da animação ('smooth' ou 'auto').
   * Se omitido, respeita 'prefers-reduced-motion'.
   */
  behavior?: ScrollBehavior;
  /**
   * Elemento ou seletor CSS específico a ser rolado prioritariamente.
   */
  target?: HTMLElement | string | null;
}

/**
 * Detecta se o sistema operacional ou navegador está configurado para movimento reduzido.
 */
export function isPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Rola a tela atual suavemente até o topo, verificando tanto a janela
 * quanto quaisquer containers com rolagem interna ativa.
 */
export function scrollToTopOfCurrentScreen(options?: ScrollToTopOptions): void {
  if (typeof window === 'undefined') return;

  const reducedMotion = isPrefersReducedMotion();
  const behavior: ScrollBehavior = options?.behavior ?? (reducedMotion ? 'auto' : 'smooth');

  // 1. Rola o viewport principal da janela
  try {
    window.scrollTo({ top: 0, left: 0, behavior });
  } catch {
    window.scrollTo(0, 0);
  }

  // 2. Rola o documentElement (HTML) e document.body caso retenham scroll
  if (document.documentElement && document.documentElement.scrollTop > 0) {
    try {
      document.documentElement.scrollTo({ top: 0, left: 0, behavior });
    } catch {
      document.documentElement.scrollTop = 0;
    }
  }

  if (document.body && document.body.scrollTop > 0) {
    try {
      document.body.scrollTo({ top: 0, left: 0, behavior });
    } catch {
      document.body.scrollTop = 0;
    }
  }

  // 3. Se um container específico foi fornecido, rola diretamente
  if (options?.target) {
    const customEl =
      typeof options.target === 'string'
        ? document.querySelector<HTMLElement>(options.target)
        : options.target;
    if (customEl && customEl.scrollTop > 0) {
      try {
        customEl.scrollTo({ top: 0, left: 0, behavior });
      } catch {
        customEl.scrollTop = 0;
      }
    }
  }

  // 4. Identifica a área principal (<main>) e containers internos com overflow ativo
  const main = document.querySelector('main');
  if (main && main.scrollTop > 0) {
    try {
      main.scrollTo({ top: 0, left: 0, behavior });
    } catch {
      main.scrollTop = 0;
    }
  }

  // 5. Varredura inteligente de elementos com rolagem vertical interna
  // Seleciona nós dentro do <main> ou marcados com classes de scroll
  const candidateSelectors = [
    'main',
    'main *',
    '.overflow-y-auto',
    '.overflow-auto',
    '[data-scrollable="true"]',
    '[data-scroll-container]',
  ].join(', ');

  try {
    const elements = document.querySelectorAll<HTMLElement>(candidateSelectors);
    elements.forEach(el => {
      if (el && el.scrollTop > 0) {
        try {
          // Verifica se o elemento tem estilo de overflow vertical efetivo
          const style = window.getComputedStyle(el);
          const hasScrollStyle =
            style.overflowY === 'auto' ||
            style.overflowY === 'scroll' ||
            style.overflow === 'auto' ||
            style.overflow === 'scroll';

          if (hasScrollStyle || el.scrollTop > 0) {
            el.scrollTo({ top: 0, left: 0, behavior });
          }
        } catch {
          el.scrollTop = 0;
        }
      }
    });
  } catch {
    // Fallback silencioso para navegadores que não suportem querySelectorAll avançado
  }
}

