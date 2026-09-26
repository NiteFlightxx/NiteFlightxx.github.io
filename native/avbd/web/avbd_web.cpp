/*
 * AVBD Web viewport adapter.
 *
 * The solver, constraints, collision code and test scenes are derived from
 * avbd-demo3d by Chris Giles. The browser adapter is specific to this site.
 */

#include <cmath>
#include <map>

#include <GL/gl.h>
#include <SDL2/SDL.h>
#include <emscripten.h>

#include "maths.h"
#include "scenes.h"
#include "solver.h"

namespace
{
constexpr int kInitialWidth = 1280;
constexpr int kInitialHeight = 760;
constexpr int kDefaultScene = 12; // Bridge
constexpr float kFovYDegrees = 45.0f;
constexpr float kNearPlane = 0.1f;
constexpr float kFarPlane = 2000.0f;

SDL_Window *gWindow = nullptr;
SDL_GLContext gContext = nullptr;
Solver *gSolver = nullptr;
Joint *gDrag = nullptr;

int gScene = kDefaultScene;
bool gRunning = true;
bool gPaused = false;
bool gStepRequested = false;
bool gShowContacts = true;
bool gOrbiting = false;

float gCameraDistance = 42.0f;
float gCameraAzimuth = rad(90.0f);
float gCameraElevation = 0.36f;
float3 gCameraTarget = {0.0f, 0.0f, 8.0f};
float3 gCameraEye = {0.0f, 0.0f, 0.0f};

float3 gBoxSize = {1.0f, 1.0f, 1.0f};
float gBoxVelocity = 16.0f;
float gBoxFriction = 0.5f;
float gBoxDensity = 1.0f;

float gDragRayDistance = 0.0f;
std::map<SDL_FingerID, float2> gActiveFingers;
Uint32 gLastTapTicks = 0;
float2 gLastTapPosition = {0.0f, 0.0f};

static const GLfloat kVertices[8][3] = {
    {-0.5f, -0.5f, -0.5f}, {0.5f, -0.5f, -0.5f}, {0.5f, 0.5f, -0.5f}, {-0.5f, 0.5f, -0.5f},
    {-0.5f, -0.5f, 0.5f}, {0.5f, -0.5f, 0.5f}, {0.5f, 0.5f, 0.5f}, {-0.5f, 0.5f, 0.5f}};

static const unsigned kTriangles[12][3] = {
    {0, 1, 2}, {0, 2, 3}, {4, 6, 5}, {4, 7, 6}, {1, 5, 6}, {1, 6, 2},
    {4, 0, 3}, {4, 3, 7}, {3, 2, 6}, {3, 6, 7}, {4, 5, 1}, {4, 1, 0}};

static const unsigned kEdges[12][2] = {
    {0, 1}, {1, 2}, {2, 3}, {3, 0}, {4, 5}, {5, 6},
    {6, 7}, {7, 4}, {0, 4}, {1, 5}, {2, 6}, {3, 7}};

float3 bodyVertexWorld(const Rigid *body, const GLfloat vertex[3])
{
    const float3 local = {vertex[0] * body->size.x, vertex[1] * body->size.y, vertex[2] * body->size.z};
    return transform(body->positionLin, body->positionAng, local);
}

void drawBody(const Rigid *body)
{
    const bool dynamic = body->mass > 0.0f;

    if (dynamic)
        glColor4f(0.16f, 0.18f, 0.17f, 0.96f);
    else
        glColor4f(0.055f, 0.065f, 0.06f, 0.96f);

    glEnable(GL_POLYGON_OFFSET_FILL);
    glPolygonOffset(1.0f, 1.0f);
    glBegin(GL_TRIANGLES);
    for (int index = 0; index < 12; ++index)
    {
        for (int corner = 0; corner < 3; ++corner)
        {
            const float3 point = bodyVertexWorld(body, kVertices[kTriangles[index][corner]]);
            glVertex3f(point.x, point.y, point.z);
        }
    }
    glEnd();
    glDisable(GL_POLYGON_OFFSET_FILL);

    if (dynamic)
        glColor4f(0.74f, 0.99f, 0.29f, 0.92f);
    else
        glColor4f(0.25f, 0.31f, 0.27f, 0.72f);

    glBegin(GL_LINES);
    for (int index = 0; index < 12; ++index)
    {
        const float3 start = bodyVertexWorld(body, kVertices[kEdges[index][0]]);
        const float3 end = bodyVertexWorld(body, kVertices[kEdges[index][1]]);
        glVertex3f(start.x, start.y, start.z);
        glVertex3f(end.x, end.y, end.z);
    }
    glEnd();
}

void drawJoint(const Joint *joint)
{
    const float3 start = joint->bodyA ? transform(joint->bodyA->positionLin, joint->bodyA->positionAng, joint->rA) : joint->rA;
    const float3 end = transform(joint->bodyB->positionLin, joint->bodyB->positionAng, joint->rB);
    glColor4f(0.74f, 0.99f, 0.29f, 0.78f);
    glBegin(GL_LINES);
    glVertex3f(start.x, start.y, start.z);
    glVertex3f(end.x, end.y, end.z);
    glEnd();
}

void drawSpring(const Spring *spring)
{
    const float3 start = transform(spring->bodyA->positionLin, spring->bodyA->positionAng, spring->rA);
    const float3 end = transform(spring->bodyB->positionLin, spring->bodyB->positionAng, spring->rB);
    glColor4f(0.68f, 0.82f, 0.55f, 0.84f);
    glBegin(GL_LINES);
    glVertex3f(start.x, start.y, start.z);
    glVertex3f(end.x, end.y, end.z);
    glEnd();
}

void drawManifold(const Manifold *manifold)
{
    if (!gShowContacts)
        return;

    glColor4f(0.96f, 0.98f, 0.93f, 0.92f);
    glBegin(GL_POINTS);
    for (int index = 0; index < manifold->numContacts; ++index)
    {
        const float3 a = transform(manifold->bodyA->positionLin, manifold->bodyA->positionAng, manifold->contacts[index].rA);
        const float3 b = transform(manifold->bodyB->positionLin, manifold->bodyB->positionAng, manifold->contacts[index].rB);
        glVertex3f(a.x, a.y, a.z);
        glVertex3f(b.x, b.y, b.z);
    }
    glEnd();
}

void drawSolver()
{
    for (const Rigid *body = gSolver->bodies; body != nullptr; body = body->next)
        if (body->mass <= 0.0f)
            drawBody(body);

    for (const Rigid *body = gSolver->bodies; body != nullptr; body = body->next)
        if (body->mass > 0.0f)
            drawBody(body);

    for (const Force *force = gSolver->forces; force != nullptr; force = force->next)
    {
        if (const auto *joint = dynamic_cast<const Joint *>(force))
            drawJoint(joint);
        else if (const auto *spring = dynamic_cast<const Spring *>(force))
            drawSpring(spring);
        else if (const auto *manifold = dynamic_cast<const Manifold *>(force))
            drawManifold(manifold);
    }
}

float3 orbitEye()
{
    const float cosElevation = cosf(gCameraElevation);
    const float sinElevation = sinf(gCameraElevation);
    const float cosAzimuth = cosf(gCameraAzimuth);
    const float sinAzimuth = sinf(gCameraAzimuth);
    const float3 offset = {
        gCameraDistance * cosElevation * cosAzimuth,
        gCameraDistance * cosElevation * sinAzimuth,
        gCameraDistance * sinElevation};
    return gCameraTarget + offset;
}

void setPerspective(float fieldOfViewDegrees, float aspect, float nearPlane, float farPlane)
{
    const float top = nearPlane * tanf(0.5f * rad(fieldOfViewDegrees));
    const float right = top * aspect;
    glFrustum(-right, right, -top, top, nearPlane, farPlane);
}

void setLookAt(const float3 &eye, const float3 &center, const float3 &worldUp)
{
    const float3 forward = normalize(center - eye);
    const float3 right = normalize(cross(forward, worldUp));
    const float3 up = cross(right, forward);
    const GLfloat matrix[16] = {
        right.x, up.x, -forward.x, 0.0f,
        right.y, up.y, -forward.y, 0.0f,
        right.z, up.z, -forward.z, 0.0f,
        0.0f, 0.0f, 0.0f, 1.0f};
    glMultMatrixf(matrix);
    glTranslatef(-eye.x, -eye.y, -eye.z);
}

void configureCameraForScene(int scene)
{
    gCameraAzimuth = rad(90.0f);
    gCameraElevation = 0.36f;
    gCameraTarget = {0.0f, 0.0f, 5.0f};
    gCameraDistance = 28.0f;

    switch (scene)
    {
    case 0: gCameraDistance = 18.0f; break;
    case 1: gCameraDistance = 13.0f; gCameraTarget = {0.0f, 0.0f, 2.0f}; break;
    case 2: gCameraDistance = 38.0f; gCameraTarget = {4.0f, -20.0f, 2.0f}; gCameraAzimuth = rad(135.0f); break;
    case 3: gCameraDistance = 42.0f; gCameraTarget = {0.0f, 0.0f, 4.0f}; gCameraAzimuth = rad(120.0f); break;
    case 4: gCameraDistance = 27.0f; gCameraTarget = {0.0f, 0.0f, 6.0f}; break;
    case 5: gCameraDistance = 31.0f; gCameraTarget = {9.0f, 0.0f, 8.0f}; break;
    case 6: gCameraDistance = 38.0f; gCameraTarget = {12.0f, 0.0f, 8.0f}; break;
    case 7: gCameraDistance = 18.0f; gCameraTarget = {0.0f, 0.0f, 8.0f}; break;
    case 8: gCameraDistance = 27.0f; gCameraTarget = {0.0f, 0.0f, 8.0f}; break;
    case 9: gCameraDistance = 18.0f; gCameraTarget = {0.0f, 0.0f, 7.0f}; break;
    case 10: gCameraDistance = 28.0f; gCameraTarget = {0.0f, 0.0f, 8.0f}; break;
    case 11: gCameraDistance = 32.0f; gCameraTarget = {0.0f, 0.0f, 12.0f}; break;
    case 12: gCameraDistance = 43.0f; gCameraTarget = {0.0f, 0.0f, 9.0f}; break;
    case 13: gCameraDistance = 31.0f; gCameraTarget = {0.0f, 0.0f, 7.0f}; break;
    default: break;
    }
}

void releaseDrag()
{
    if (gDrag != nullptr)
    {
        delete gDrag;
        gDrag = nullptr;
    }
}

bool screenToWorldRay(float2 screenPosition, float3 &origin, float3 &direction)
{
    int width = 0;
    int height = 0;
    SDL_GetWindowSize(gWindow, &width, &height);
    if (width <= 0 || height <= 0)
        return false;

    const float aspect = static_cast<float>(width) / static_cast<float>(height);
    const float ndcX = screenPosition.x / static_cast<float>(width) * 2.0f - 1.0f;
    const float ndcY = 1.0f - screenPosition.y / static_cast<float>(height) * 2.0f;
    const float3 forward = normalize(gCameraTarget - gCameraEye);
    float3 right = cross(forward, float3{0.0f, 0.0f, 1.0f});
    if (lengthSq(right) < 1.0e-8f)
        right = cross(forward, float3{0.0f, 1.0f, 0.0f});
    right = normalize(right);
    const float3 up = cross(right, forward);
    const float tangent = tanf(0.5f * rad(kFovYDegrees));
    direction = normalize(forward + right * (ndcX * aspect * tangent) + up * (ndcY * tangent));
    origin = gCameraEye;
    return true;
}

bool beginDrag(float2 screenPosition)
{
    float3 rayOrigin;
    float3 rayDirection;
    if (!screenToWorldRay(screenPosition, rayOrigin, rayDirection))
        return false;

    float3 localHit;
    Rigid *body = gSolver->pick(rayOrigin, rayDirection, localHit);
    if (body == nullptr)
        return false;

    const float3 worldHit = transform(body->positionLin, body->positionAng, localHit);
    gDragRayDistance = max(dot(worldHit - rayOrigin, rayDirection), 0.1f);
    gDrag = new Joint(gSolver, nullptr, body, worldHit, localHit, 5000.0f, 0.0f);
    return true;
}

void updateDrag(float2 screenPosition)
{
    if (gDrag == nullptr)
        return;
    float3 rayOrigin;
    float3 rayDirection;
    if (screenToWorldRay(screenPosition, rayOrigin, rayDirection))
        gDrag->rA = rayOrigin + rayDirection * gDragRayDistance;
}

void shootBox()
{
    const float3 forward = normalize(gCameraTarget - gCameraEye);
    const float spawnOffset = 2.0f + 0.5f * length(gBoxSize);
    new Rigid(gSolver, gBoxSize, gBoxDensity, gBoxFriction, gCameraEye + forward * spawnOffset, forward * gBoxVelocity);
}

void zoomCamera(float wheelDelta)
{
    // Exponential zoom keeps the perceived speed consistent across near and
    // far camera distances. Positive wheel values zoom towards the scene.
    const float scale = expf(-wheelDelta * 0.12f);
    gCameraDistance = clamp(gCameraDistance * scale, 4.0f, 180.0f);
}

void handleTouchEvent(const SDL_Event &event)
{
    int width = 0;
    int height = 0;
    SDL_GetWindowSize(gWindow, &width, &height);

    if (event.type == SDL_FINGERDOWN)
    {
        const float2 position = {event.tfinger.x * width, event.tfinger.y * height};
        gActiveFingers[event.tfinger.fingerId] = position;
        if (gActiveFingers.size() == 1)
        {
            const Uint32 now = SDL_GetTicks();
            const float2 delta = position - gLastTapPosition;
            if (gLastTapTicks > 0 && now - gLastTapTicks < 300 && lengthSq(delta) < 1600.0f)
            {
                shootBox();
                gLastTapTicks = 0;
            }
            else
            {
                gLastTapTicks = now;
                gLastTapPosition = position;
                beginDrag(position);
            }
        }
        else
        {
            releaseDrag();
        }
    }
    else if (event.type == SDL_FINGERMOTION)
    {
        const float2 position = {event.tfinger.x * width, event.tfinger.y * height};
        gActiveFingers[event.tfinger.fingerId] = position;
        if (gActiveFingers.size() == 1)
            updateDrag(position);
    }
    else if (event.type == SDL_FINGERUP)
    {
        releaseDrag();
        gActiveFingers.erase(event.tfinger.fingerId);
    }
    else if (event.type == SDL_MULTIGESTURE && event.mgesture.numFingers == 2)
    {
        gCameraAzimuth -= event.mgesture.dTheta * 2.0f;
        const float zoom = 1.0f + event.mgesture.dDist * 3.0f;
        if (zoom > 0.05f)
            gCameraDistance = clamp(gCameraDistance / zoom, 4.0f, 180.0f);
    }
}

void pollInput()
{
    SDL_Event event;
    while (SDL_PollEvent(&event))
    {
        // Mouse, wheel and keyboard input are forwarded explicitly by React.
        // SDL's DOM event translation is unreliable when its hidden window is
        // resized independently from the CSS canvas. Touch remains on SDL so
        // multi-finger gestures keep their native normalized coordinates.
        if (event.type == SDL_FINGERDOWN || event.type == SDL_FINGERMOTION || event.type == SDL_FINGERUP || event.type == SDL_MULTIGESTURE)
            handleTouchEvent(event);
    }
}

void renderFrame()
{
    if (!gRunning || gSolver == nullptr || gWindow == nullptr)
        return;

    pollInput();
    if (!gPaused || gStepRequested)
    {
        gSolver->step();
        gStepRequested = false;
    }

    int width = 0;
    int height = 0;
    SDL_GetWindowSize(gWindow, &width, &height);
    if (width <= 0 || height <= 0)
        return;

    glViewport(0, 0, width, height);
    glClearColor(0.018f, 0.022f, 0.02f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    glEnable(GL_DEPTH_TEST);
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glDisable(GL_CULL_FACE);
    glLineWidth(1.35f);
    glPointSize(5.0f);

    gCameraEye = orbitEye();
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    setPerspective(kFovYDegrees, static_cast<float>(width) / static_cast<float>(height), kNearPlane, kFarPlane);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    setLookAt(gCameraEye, gCameraTarget, float3{0.0f, 0.0f, 1.0f});

    drawSolver();
    SDL_GL_SwapWindow(gWindow);
}
} // namespace

extern "C"
{
EMSCRIPTEN_KEEPALIVE void avbd_load_scene(int scene)
{
    if (gSolver == nullptr || scene < 0 || scene >= sceneCount)
        return;
    releaseDrag();
    gScene = scene;
    scenes[gScene](gSolver);
    configureCameraForScene(gScene);
}

EMSCRIPTEN_KEEPALIVE void avbd_reset_scene()
{
    avbd_load_scene(gScene);
}

EMSCRIPTEN_KEEPALIVE void avbd_set_paused(int paused)
{
    gPaused = paused != 0;
}

EMSCRIPTEN_KEEPALIVE void avbd_step_once()
{
    gPaused = true;
    gStepRequested = true;
}

EMSCRIPTEN_KEEPALIVE void avbd_set_contacts(int visible)
{
    gShowContacts = visible != 0;
}

EMSCRIPTEN_KEEPALIVE void avbd_pointer_down(int button, float x, float y)
{
    if (gSolver == nullptr)
        return;

    const float2 position = {x, y};
    if (button == 0)
        beginDrag(position);
    else if (button == 1)
        shootBox();
    else if (button == 2)
        gOrbiting = true;
}

EMSCRIPTEN_KEEPALIVE void avbd_pointer_move(float x, float y, float deltaX, float deltaY)
{
    if (gSolver == nullptr)
        return;

    updateDrag(float2{x, y});
    if (gOrbiting)
    {
        gCameraAzimuth -= deltaX * 0.005f;
        gCameraElevation = clamp(gCameraElevation + deltaY * 0.005f, rad(-80.0f), rad(80.0f));
    }
}

EMSCRIPTEN_KEEPALIVE void avbd_pointer_up(int button)
{
    if (button == 0)
        releaseDrag();
    else if (button == 2)
        gOrbiting = false;
}

EMSCRIPTEN_KEEPALIVE void avbd_pointer_cancel()
{
    releaseDrag();
    gOrbiting = false;
}

EMSCRIPTEN_KEEPALIVE void avbd_zoom(float wheelDelta)
{
    zoomCamera(wheelDelta);
}

EMSCRIPTEN_KEEPALIVE void avbd_shoot()
{
    if (gSolver != nullptr)
        shootBox();
}

EMSCRIPTEN_KEEPALIVE void avbd_resize(int width, int height)
{
    if (gWindow != nullptr && width > 0 && height > 0)
        SDL_SetWindowSize(gWindow, width, height);
}

EMSCRIPTEN_KEEPALIVE void avbd_shutdown()
{
    if (!gRunning)
        return;
    gRunning = false;
    emscripten_cancel_main_loop();
    releaseDrag();
    delete gSolver;
    gSolver = nullptr;
    if (gContext != nullptr)
    {
        SDL_GL_DeleteContext(gContext);
        gContext = nullptr;
    }
    if (gWindow != nullptr)
    {
        SDL_DestroyWindow(gWindow);
        gWindow = nullptr;
    }
    SDL_Quit();
}
}

int main()
{
    if (SDL_Init(SDL_INIT_VIDEO) < 0)
        return -1;

    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
    SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);
    SDL_GL_SetAttribute(SDL_GL_STENCIL_SIZE, 8);

    gWindow = SDL_CreateWindow(
        u8"Nite | 个人探索工坊",
        SDL_WINDOWPOS_CENTERED,
        SDL_WINDOWPOS_CENTERED,
        kInitialWidth,
        kInitialHeight,
        SDL_WINDOW_OPENGL | SDL_WINDOW_RESIZABLE | SDL_WINDOW_ALLOW_HIGHDPI);
    if (gWindow == nullptr)
        return -1;

    gContext = SDL_GL_CreateContext(gWindow);
    if (gContext == nullptr)
        return -1;

    SDL_GL_MakeCurrent(gWindow, gContext);
    SDL_GL_SetSwapInterval(1);
    gSolver = new Solver();
    avbd_load_scene(kDefaultScene);
    emscripten_set_main_loop(renderFrame, 0, 1);
    return 0;
}
