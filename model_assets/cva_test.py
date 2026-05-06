import cv2
import mediapipe as mp
import math

mp_pose = mp.solutions.pose
pose = mp_pose.Pose()

cap = cv2.VideoCapture(0)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = pose.process(image)

    if results.pose_landmarks:
        landmarks = results.pose_landmarks.landmark

        ear = landmarks[7]        # 귀
        shoulder = landmarks[11] # C7 대체

        dx = ear.x - shoulder.x
        dy = ear.y - shoulder.y

        angle = math.degrees(math.atan2(dy, dx))
        CVA = abs(angle)

        if CVA < 38:
            text = "BAD POSTURE"
        else:
            text = "GOOD POSTURE"

        cv2.putText(frame, f"CVA: {CVA:.2f}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0,255,0), 2)
        cv2.putText(frame, text, (10, 70),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0,0,255), 2)

    cv2.imshow('CVA Test', frame)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()
