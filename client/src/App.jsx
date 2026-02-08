import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import Home from './pages/Home.jsx';
import QuestionsCatalog from './pages/QuestionsCatalog.jsx';
import AddQuestion from './pages/AddQuestion.jsx';
import Revision from './pages/Revision.jsx';
import TodayTask from './pages/TodayTask.jsx';
import SolvedQuestions from './pages/SolvedQuestions.jsx';
import StarredQuestions from './pages/StarredQuestions.jsx';
import Topics from './pages/Topics.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Logout from './pages/Logout.jsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/logout" element={<Logout />} />
          <Route path="/questions" element={<QuestionsCatalog />} />
          <Route path="/revision" element={<Revision />} />
          <Route path="/today" element={<TodayTask />} />
          <Route path="/solved" element={<SolvedQuestions />} />
          <Route path="/starred" element={<StarredQuestions />} />
          <Route path="/topics" element={<Topics />} />
          <Route path="/add" element={<AddQuestion />} />

          {/* Keep old links working if someone hits unknown paths */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
