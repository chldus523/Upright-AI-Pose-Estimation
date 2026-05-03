import math
from typing import Optional, Protocol

class XYPoint(Protocol):
    # MediaPipe 좌표에 맞춰 float으로 설정
    x: float
    y: float

def distance(a: XYPoint, b: XYPoint) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)

def calculate_angle(a: XYPoint, b: XYPoint, c: XYPoint) -> Optional[float]:
    # distance 함수를 재사용
    ab_mag = distance(a, b)
    cb_mag = distance(c, b)
    
    # 부동소수점 오차를 대비해 아주 작은 값과 비교
    if ab_mag < 1e-6 or cb_mag < 1e-6:
        return None

    # 벡터 구성
    ab_x = a.x - b.x
    ab_y = a.y - b.y
    cb_x = c.x - b.x
    cb_y = c.y - b.y

    # 내적(Dot Product) 계산
    dot_product = ab_x * cb_x + ab_y * cb_y
    
    # cos(theta) 계산 및 도메인(-1.0 ~ 1.0) 보정 방어 로직
    cosine = max(-1.0, min(1.0, dot_product / (ab_mag * cb_mag)))
    
    return math.degrees(math.acos(cosine))

def line_tilt_degrees(start: XYPoint, end: XYPoint) -> float:
    return abs(math.degrees(math.atan2(end.y - start.y, end.x - start.x)))