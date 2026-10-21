import data from '../data/curriculum.json';

export interface CourseLesson {
  id: string;
  title: string;
  goal: string;
  exercise: string;
  requires: string[];
  status: 'published' | 'planned';
  articleSlug?: string;
}
export interface CourseModule {
  id: string;
  title: string;
  description: string;
  lessons: CourseLesson[];
  materials: string[];
}
export interface Course {
  id: string;
  domain: string;
  number: string;
  title: string;
  summary: string;
  entry: string[];
  outcomes: string[];
  boundaries: string;
  modules: CourseModule[];
}

// Historical editorial outline only. Public navigation uses readingOrder.ts;
// do not restore course landing pages or completion tracking from this data.
export const COURSES = data as Course[];
export const courseLessons = (course: Course) => course.modules.flatMap((module) => module.lessons);
export const publishedLessons = (course: Course) => courseLessons(course).filter((lesson) => lesson.status === 'published');
export const courseHref = (id: string) => `${import.meta.env.BASE_URL}knowledge/courses/${id}/`;
export const lessonHref = (lesson: CourseLesson) => lesson.status === 'published' && lesson.articleSlug ? `${import.meta.env.BASE_URL}knowledge/${lesson.articleSlug}/` : undefined;

export function courseContext(slug: string) {
  for (const course of COURSES) {
    for (const [moduleIndex, module] of course.modules.entries()) {
      const lessonIndex = module.lessons.findIndex((lesson) => lesson.status === 'published' && lesson.articleSlug === slug);
      if (lessonIndex < 0) continue;
      const lesson = module.lessons[lessonIndex];
      const lessons = courseLessons(course);
      const index = lessons.findIndex((entry) => entry.id === lesson.id);
      return { course, module, moduleIndex, lesson, lessonIndex, previous: lessons[index - 1], next: lessons[index + 1] };
    }
  }
  return undefined;
}
export type CourseContext = NonNullable<ReturnType<typeof courseContext>>;
