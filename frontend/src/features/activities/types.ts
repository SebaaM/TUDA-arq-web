export type Availability = {
  capacity: number;
  available_slots: number;
};

export type Activity = {
  id: string;
  title: string;
  category: string;
  starts_at: string;
  availability: Availability;
};

export type CreateActivityPayload = {
  title: string;
  category: string;
  starts_at: string;
  capacity: number;
};

export type Enrollment = {
  activity_id: string;
  enrolled_at: string;
};
