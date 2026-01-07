export const getResultViewScript = (saved: any) => {
  const userNameVal = saved.userName ? JSON.stringify(saved.userName) : "''";
  const savedIdVal = JSON.stringify(saved.id);
  const speakerStr = saved.content?.tts_speaker ? `'${saved.content.tts_speaker}'` : "'nara'";
  const contentIdStr = saved.content?.id ? saved.content.id : 'null';

  return `
    (function() {
      try {
        delete window.addQuestionButtons;
        delete window.initQuestionButtons;
        
        const createTrap = (propName) => {
          Object.defineProperty(window, propName, {
            configurable: true, enumerable: true,
            get: function() { return undefined; },
            set: function(val) {
               if (val && val.toString().includes('버튼이 이미 존재합니다')) {
                  return;
               }
               Object.defineProperty(window, propName, {
                 value: val, writable: true, configurable: true, enumerable: true
               });
            }
          });
        };
        createTrap('addQuestionButtons');
        createTrap('initQuestionButtons');
      } catch(e) {}
    })();

    window.savedContentSpeaker = ${speakerStr};
    window.savedContentId = ${contentIdStr};

    window.addQuestionButtons = function() {
      const contentHtml = document.getElementById('contentHtml');
      if (!contentHtml) return false;
      
      const menuSections = contentHtml.querySelectorAll('.menu-section');
      if (menuSections.length === 0) return false;
      
      let buttonsAdded = 0;
      menuSections.forEach((menuSection) => {
        const existing = menuSection.querySelector('.question-button-container');
        if (existing) existing.remove();
        
        const titleEl = menuSection.querySelector('.menu-title');
        const menuTitle = titleEl?.textContent?.trim() || '';
        
        const subtitlesContent = [];
        menuSection.querySelectorAll('.subtitle-section').forEach(sec => {
          const t = sec.querySelector('.subtitle-title')?.textContent?.trim();
          const c = sec.querySelector('.subtitle-content')?.textContent?.trim();
          if (t && c) subtitlesContent.push({title: t, content: c});
        });
        const subtitles = subtitlesContent.map(s => s.title);
        
        const div = document.createElement('div');
        div.className = 'question-button-container';
        const btn = document.createElement('button');
        btn.className = 'question-button';
        btn.textContent = '추가 질문하기';
        btn.onclick = () => window.openQuestionPopup(menuTitle, subtitles, subtitlesContent);
        div.appendChild(btn);
        menuSection.appendChild(div);
        buttonsAdded++;
      });
      return buttonsAdded > 0;
    };

    window.openQuestionPopup = function(title, subtitles, content) {
      const overlay = document.getElementById('questionPopupOverlay');
      if (!overlay) return;
      
      document.getElementById('questionMenuTitle').textContent = title;
      overlay.style.display = 'flex';
      window.currentQuestionData = { menuTitle: title, subtitles, subtitlesContent: content };
      
      let counts = {};
      try { counts = JSON.parse(localStorage.getItem('question_counts_' + ${savedIdVal}) || '{}'); } catch(e) {}
      const count = counts[title] || 0;
      const remaining = 3 - count;
      const isLimit = count >= 3;
      
      const countEl = document.getElementById('questionRemainingCountValue');
      if (countEl) {
        countEl.textContent = remaining;
        countEl.className = isLimit ? 'question-remaining-value limit-reached' : 'question-remaining-value';
      }
      
      const ta = document.getElementById('questionTextarea');
      const btn = document.getElementById('questionSubmitBtn');
      ta.value = '';
      ta.disabled = isLimit;
      if (btn) btn.disabled = isLimit;
      
      const hint = document.querySelector('.question-char-count-hint');
      if (hint) hint.textContent = isLimit ? '최대 3회까지 질문할 수 있습니다.' : '한 번에 하나의 질문만 가능합니다.';
    };
    
    window.closeQuestionPopup = function() {
      const overlay = document.getElementById('questionPopupOverlay');
      if (overlay) overlay.style.display = 'none';
    };
    
    window.handleQuestionSubmit = async function(e) {
      e.preventDefault();
      if (!window.currentQuestionData) return;
      const { menuTitle, subtitles, subtitlesContent } = window.currentQuestionData;
      
      let counts = {};
      try { counts = JSON.parse(localStorage.getItem('question_counts_' + ${savedIdVal}) || '{}'); } catch(e) {}
      if ((counts[menuTitle] || 0) >= 3) return;
      
      const q = document.getElementById('questionTextarea').value.trim();
      if (!q) return;
      
      document.getElementById('questionLoading').style.display = 'block';
      document.getElementById('questionSubmitBtn').disabled = true;
      
      try {
        const res = await fetch('/api/question', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ question: q, menuTitle, subtitles, subtitlesContent, userName: ${userNameVal} })
        });
        const data = await res.json();
        if (!data.answer) throw new Error(data.error || 'No answer');
        
        document.getElementById('questionAnswerText').textContent = data.answer;
        document.getElementById('questionAnswer').style.display = 'block';
        
        counts[menuTitle] = (counts[menuTitle] || 0) + 1;
        localStorage.setItem('question_counts_' + ${savedIdVal}, JSON.stringify(counts));
        
        const remaining = 3 - counts[menuTitle];
        document.getElementById('questionRemainingCountValue').textContent = remaining;
        if (remaining <= 0) {
          document.getElementById('questionTextarea').disabled = true;
          document.getElementById('questionSubmitBtn').disabled = true;
        }
      } catch(err) {
        alert(err.message);
      } finally {
        document.getElementById('questionLoading').style.display = 'none';
        if ((counts[menuTitle] || 0) < 3) document.getElementById('questionSubmitBtn').disabled = false;
      }
    };

    window.initQuestionButtons = function() {
      let count = 0;
      const run = () => {
        if (window.addQuestionButtons() || count++ > 10) return;
        setTimeout(run, 200 * count);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
      else run();
      setTimeout(run, 1000);
    };
    
    setTimeout(window.initQuestionButtons, 100);
  `;
}
