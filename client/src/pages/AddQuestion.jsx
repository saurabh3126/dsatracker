import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../lib/api';
import addCss from '../legacy/add.css?raw';
import { useLegacyStyle } from '../legacy/useLegacyStyle';

export default function AddQuestion() {
  const navigate = useNavigate();

  useLegacyStyle('add', addCss);

  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [coreConcept, setCoreConcept] = useState('');
  const [approach, setApproach] = useState(['']);
  const [pitfalls, setPitfalls] = useState(['']);
  const [codeTemplate, setCodeTemplate] = useState('');
  const [timeComplexity, setTimeComplexity] = useState('');
  const [spaceComplexity, setSpaceComplexity] = useState('');

  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  function showNotification(message, type = 'success') {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setNotification({ id, message, type });
    window.setTimeout(() => {
      setNotification((n) => (n?.id === id ? null : n));
    }, 3000);
  }

  function addApproachStep() {
    setApproach((prev) => [...prev, '']);
  }

  function addPitfall() {
    setPitfalls((prev) => [...prev, '']);
  }

  function removeApproachStep(index) {
    setApproach((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function removePitfall(index) {
    setPitfalls((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        title,
        link,
        topic,
        difficulty,
        coreConcept,
        approach: approach.map((s) => String(s || '').trim()).filter(Boolean),
        commonPitfalls: pitfalls.map((s) => String(s || '').trim()).filter(Boolean),
        codeTemplate,
        timeComplexity,
        spaceComplexity,
      };

      await apiPost('/api/questions', payload);
      showNotification('Question added successfully!', 'success');

      setTitle('');
      setLink('');
      setTopic('');
      setDifficulty('');
      setCoreConcept('');
      setApproach(['']);
      setPitfalls(['']);
      setCodeTemplate('');
      setTimeComplexity('');
      setSpaceComplexity('');

      window.setTimeout(() => {
        navigate('/questions');
      }, 2000);
    } catch (error) {
      console.error('Error:', error);
      showNotification(error?.message || 'Failed to add question', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <form id="addQuestionForm" className="add-question-form" onSubmit={onSubmit}>
        <div className="form-header">
          <h1>Add New Question</h1>
          <p>Fill in the details to add a new DSA question</p>
        </div>

        <div className="form-section">
          <h2>Basic Information</h2>
          <div className="form-group">
            <label htmlFor="title">Question Title *</label>
            <input type="text" id="title" name="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="form-group">
            <label htmlFor="link">Problem Link (LeetCode/Other) *</label>
            <input type="url" id="link" name="link" required value={link} onChange={(e) => setLink(e.target.value)} />
          </div>

          <div className="form-group">
            <label htmlFor="topic">Topic *</label>
            <select id="topic" name="topic" required value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">Select Topic</option>
              <option value="Sorting Techniques">Sorting Techniques</option>
              <option value="Arrays">Arrays</option>
              <option value="Binary Search">Binary Search</option>
              <option value="Strings">Strings</option>
              <option value="Linked List">Linked List</option>
              <option value="Recursion">Recursion</option>
              <option value="Bit Manipulation">Bit Manipulation</option>
              <option value="Stack & Queue">Stack & Queue</option>
              <option value="Trees">Trees</option>
              <option value="Graphs">Graphs</option>
              <option value="Dynamic Programming">Dynamic Programming</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="difficulty">Difficulty *</label>
            <select id="difficulty" name="difficulty" required value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="">Select Difficulty</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </div>
        </div>

        <div className="form-section">
          <h2>Detailed Information</h2>
          <div className="form-group">
            <label htmlFor="coreConcept">Core Concept *</label>
            <textarea id="coreConcept" name="coreConcept" required value={coreConcept} onChange={(e) => setCoreConcept(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Approach Steps *</label>
            <div id="approachSteps">
              {approach.map((value, idx) => (
                <div className="dynamic-inputs" key={`approach-${idx}`}>
                  <input
                    type="text"
                    name="approach[]"
                    required
                    value={value}
                    onChange={(e) => setApproach((prev) => prev.map((p, i) => (i === idx ? e.target.value : p)))}
                  />
                  <button
                    type="button"
                    className="remove-input-btn"
                    onClick={() => removeApproachStep(idx)}
                    aria-label="Remove approach step"
                  >
                    <i className="fas fa-minus"></i>
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="add-input-btn" onClick={addApproachStep}>
              <i className="fas fa-plus"></i> Add Step
            </button>
          </div>

          <div className="form-group">
            <label>Common Pitfalls *</label>
            <div id="pitfalls">
              {pitfalls.map((value, idx) => (
                <div className="dynamic-inputs" key={`pitfall-${idx}`}>
                  <input
                    type="text"
                    name="pitfalls[]"
                    required
                    value={value}
                    onChange={(e) => setPitfalls((prev) => prev.map((p, i) => (i === idx ? e.target.value : p)))}
                  />
                  <button
                    type="button"
                    className="remove-input-btn"
                    onClick={() => removePitfall(idx)}
                    aria-label="Remove pitfall"
                  >
                    <i className="fas fa-minus"></i>
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="add-input-btn" onClick={addPitfall}>
              <i className="fas fa-plus"></i> Add Pitfall
            </button>
          </div>
        </div>

        <div className="form-section">
          <h2>Implementation Details</h2>
          <div className="form-group">
            <label htmlFor="codeTemplate">Code Template *</label>
            <textarea id="codeTemplate" name="codeTemplate" required value={codeTemplate} onChange={(e) => setCodeTemplate(e.target.value)} />
          </div>

          <div className="form-group">
            <label htmlFor="timeComplexity">Time Complexity *</label>
            <input
              type="text"
              id="timeComplexity"
              name="timeComplexity"
              placeholder="e.g., O(n)"
              required
              value={timeComplexity}
              onChange={(e) => setTimeComplexity(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="spaceComplexity">Space Complexity *</label>
            <input
              type="text"
              id="spaceComplexity"
              name="spaceComplexity"
              placeholder="e.g., O(n)"
              required
              value={spaceComplexity}
              onChange={(e) => setSpaceComplexity(e.target.value)}
            />
          </div>
        </div>

        <button type="submit" className="submit-btn" disabled={saving}>
          <i className="fas fa-plus"></i> {saving ? 'Adding…' : 'Add Question'}
        </button>
      </form>

      {notification ? (
        <div className={`notification ${notification.type}`}>
          <i className={`fas ${notification.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
          <span>{notification.message}</span>
        </div>
      ) : null}

      {saving ? (
        <div className="loading">
          <div className="spinner"></div>
        </div>
      ) : null}
    </div>
  );
}
